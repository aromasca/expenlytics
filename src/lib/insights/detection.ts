import type Database from 'better-sqlite3'
import type { InsightCard, SparklinePoint, InsightDetail, InsightTransaction } from './types'
import { scoreInsight } from './ranking'

interface PeriodSpending {
  period: string
  category: string
  amount: number
}

interface MonthlyTotal {
  period: string
  amount: number
}

interface MerchantCount {
  period: string
  merchant_count: number
  total_amount: number
}

interface CategoryShare {
  category: string
  current_pct: number
  previous_pct: number
  current_amount: number
  previous_amount: number
}

function daysAgoFromPeriod(period: string): number {
  const now = new Date()
  // period is YYYY-MM
  const [year, month] = period.split('-').map(Number)
  const periodDate = new Date(year, month - 1, 15) // mid-month
  return Math.max(0, Math.floor((now.getTime() - periodDate.getTime()) / (1000 * 60 * 60 * 24)))
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export function detectCategoryTrends(db: Database.Database): InsightCard[] {
  // Get spending by category for current month vs previous month
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COALESCE(c.name, 'Uncategorized') as category,
      SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-6 months')
    GROUP BY period, category
    ORDER BY period ASC
  `).all() as PeriodSpending[]

  // Group by category across periods
  const categoryPeriods = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (!categoryPeriods.has(row.category)) categoryPeriods.set(row.category, new Map())
    categoryPeriods.get(row.category)!.set(row.period, row.amount)
  }

  // Get sorted periods
  const allPeriods = [...new Set(rows.map(r => r.period))].sort()
  if (allPeriods.length < 2) return []

  const currentPeriod = allPeriods[allPeriods.length - 1]
  const previousPeriod = allPeriods[allPeriods.length - 2]

  const insights: InsightCard[] = []

  for (const [category, periods] of categoryPeriods) {
    const current = periods.get(currentPeriod) ?? 0
    const previous = periods.get(previousPeriod) ?? 0
    const change = pctChange(current, previous)
    const dollarDiff = current - previous

    // Criteria: >15% increase AND >$50 absolute change
    if (Math.abs(change) < 15 || Math.abs(dollarDiff) < 50) continue

    const isIncrease = dollarDiff > 0
    const severity = isIncrease ? 'concerning' as const : 'favorable' as const

    const sparkline: SparklinePoint[] = allPeriods.map(p => ({
      label: p,
      value: periods.get(p) ?? 0,
    }))

    // Fetch actual transactions driving this insight
    const txns = db.prepare(`
      SELECT t.date, t.description, t.amount, COALESCE(c.name, 'Uncategorized') as category
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.type = 'debit'
        AND COALESCE(c.name, 'Uncategorized') = ?
        AND strftime('%Y-%m', t.date) = ?
      ORDER BY t.amount DESC
      LIMIT 10
    `).all([category, currentPeriod]) as InsightTransaction[]

    const topItems = txns.slice(0, 3).map(t => t.description).join(', ')
    const absDollarDiff = Math.abs(dollarDiff)
    const absChangePct = Math.abs(change)
    const explanation = isIncrease
      ? `You spent $${absDollarDiff.toFixed(0)} more on ${category} this month compared to last month. Top charges: ${topItems || 'N/A'}. This represents a ${absChangePct.toFixed(0)}% increase.`
      : `${category} spending decreased by $${absDollarDiff.toFixed(0)} (${absChangePct.toFixed(0)}%) compared to last month.`

    const detail: InsightDetail = {
      periodLabel: `${previousPeriod} vs ${currentPeriod}`,
      breakdown: [{ label: category, current, previous }],
      explanation,
      transactions: txns,
    }

    const id = `cat-trend-${category.toLowerCase().replace(/\s+/g, '-')}`
    const absChange = Math.abs(change)
    const absDollar = Math.abs(dollarDiff)

    const headline = isIncrease
      ? `${category} spending up ${absChange.toFixed(0)}% this month`
      : `${category} spending down ${absChange.toFixed(0)}% this month`

    const metric = `$${current.toFixed(0)} vs $${previous.toFixed(0)} last month (${isIncrease ? '+' : '-'}$${absDollar.toFixed(0)})`

    const card: InsightCard = {
      id,
      type: 'category_trend',
      severity,
      headline,
      metric,
      percentChange: change,
      dollarChange: dollarDiff,
      score: 0,
      sparkline,
      detail,
    }
    card.score = scoreInsight(card, daysAgoFromPeriod(currentPeriod))
    insights.push(card)
  }

  return insights.sort((a, b) => b.score - a.score)
}

export function detectLifestyleInflation(db: Database.Database): InsightCard[] {
  // Rolling 3-month average spending comparison
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      SUM(t.amount) as amount
    FROM transactions t
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-12 months')
    GROUP BY period
    ORDER BY period ASC
  `).all() as MonthlyTotal[]

  if (rows.length < 6) return []

  // Compute 3-month rolling averages
  const rollingAvgs: Array<{ period: string; avg: number }> = []
  for (let i = 2; i < rows.length; i++) {
    const avg = (rows[i].amount + rows[i - 1].amount + rows[i - 2].amount) / 3
    rollingAvgs.push({ period: rows[i].period, avg: Math.round(avg * 100) / 100 })
  }

  if (rollingAvgs.length < 2) return []

  const current = rollingAvgs[rollingAvgs.length - 1]
  const previous = rollingAvgs[rollingAvgs.length - 2]
  // Also compare to 3 months ago if available
  const threeAgo = rollingAvgs.length >= 4 ? rollingAvgs[rollingAvgs.length - 4] : previous

  const change = pctChange(current.avg, threeAgo.avg)
  const dollarDiff = current.avg - threeAgo.avg

  // Criteria: >10% increase sustained
  if (change <= 10) return []

  const sparkline: SparklinePoint[] = rows.map(r => ({
    label: r.period,
    value: r.amount,
  }))

  const headline = `Monthly spending up ${change.toFixed(0)}% over past ${rollingAvgs.length >= 4 ? '6' : '3'} months`
  const metric = `$${current.avg.toFixed(0)}/mo avg vs $${threeAgo.avg.toFixed(0)}/mo (+$${Math.abs(dollarDiff).toFixed(0)})`

  // Get top spending transactions from the most recent month to show what's driving it
  const recentTxns = db.prepare(`
    SELECT t.date, t.description, t.amount, COALESCE(c.name, 'Uncategorized') as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit'
      AND strftime('%Y-%m', t.date) = ?
    ORDER BY t.amount DESC
    LIMIT 10
  `).all([current.period]) as InsightTransaction[]

  // Get category breakdown for current vs earlier period
  const currentCats = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category, SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND strftime('%Y-%m', t.date) = ?
    GROUP BY category ORDER BY amount DESC LIMIT 5
  `).all([current.period]) as Array<{ category: string; amount: number }>

  const earlierCats = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category, SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND strftime('%Y-%m', t.date) = ?
    GROUP BY category ORDER BY amount DESC LIMIT 5
  `).all([threeAgo.period]) as Array<{ category: string; amount: number }>

  const earlierMap = new Map(earlierCats.map(c => [c.category, c.amount]))
  const breakdown = currentCats.map(c => ({
    label: c.category,
    current: c.amount,
    previous: earlierMap.get(c.category) ?? 0,
  }))

  const growingCats = breakdown.filter(b => b.current > b.previous).slice(0, 3).map(b => `${b.label} (+$${(b.current - b.previous).toFixed(0)})`).join(', ')
  const explanation = `Your average monthly spending has grown steadily from $${threeAgo.avg.toFixed(0)} to $${current.avg.toFixed(0)}. Categories driving the increase: ${growingCats || 'spread across categories'}. Here are your biggest charges this month.`

  const detail: InsightDetail = {
    periodLabel: `${threeAgo.period} vs ${current.period}`,
    breakdown,
    explanation,
    transactions: recentTxns,
  }

  const card: InsightCard = {
    id: 'lifestyle-inflation',
    type: 'lifestyle_inflation',
    severity: 'concerning',
    headline,
    metric,
    percentChange: change,
    dollarChange: dollarDiff,
    score: 0,
    sparkline,
    detail,
  }
  card.score = scoreInsight(card, daysAgoFromPeriod(current.period))
  return [card]
}

export function detectRecurringGrowth(db: Database.Database): InsightCard[] {
  // Compare recurring merchant count and spend quarter-over-quarter
  const rows = db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COUNT(DISTINCT t.normalized_merchant) as merchant_count,
      SUM(t.amount) as total_amount
    FROM transactions t
    WHERE t.type = 'debit'
      AND t.normalized_merchant IS NOT NULL
      AND t.date >= date('now', '-6 months')
    GROUP BY period
    ORDER BY period ASC
  `).all() as MerchantCount[]

  if (rows.length < 2) return []

  const insights: InsightCard[] = []

  const current = rows[rows.length - 1]
  const previous = rows[rows.length - 2]

  const countDiff = current.merchant_count - previous.merchant_count
  const spendChange = pctChange(current.total_amount, previous.total_amount)
  const dollarDiff = current.total_amount - previous.total_amount

  // Criteria: 2+ new recurring merchants OR >20% spend increase
  if (countDiff < 2 && spendChange <= 20) return insights

  const sparkline: SparklinePoint[] = rows.map(r => ({
    label: r.period,
    value: r.merchant_count,
  }))

  let headline: string
  if (countDiff >= 2) {
    headline = `${countDiff} new recurring charges detected this month`
  } else {
    headline = `Subscription spending up ${spendChange.toFixed(0)}% this month`
  }

  const metric = `$${current.total_amount.toFixed(0)}/mo across ${current.merchant_count} merchants`

  // Find new merchants that appeared in current period but not previous
  const currentMerchants = db.prepare(`
    SELECT DISTINCT t.normalized_merchant as merchant
    FROM transactions t
    WHERE t.type = 'debit' AND t.normalized_merchant IS NOT NULL
      AND strftime('%Y-%m', t.date) = ?
  `).all([current.period]) as Array<{ merchant: string }>

  const previousMerchants = db.prepare(`
    SELECT DISTINCT t.normalized_merchant as merchant
    FROM transactions t
    WHERE t.type = 'debit' AND t.normalized_merchant IS NOT NULL
      AND strftime('%Y-%m', t.date) = ?
  `).all([previous.period]) as Array<{ merchant: string }>

  const prevSet = new Set(previousMerchants.map(m => m.merchant))
  const newMerchants = currentMerchants.filter(m => !prevSet.has(m.merchant)).map(m => m.merchant)

  // Get transactions for new merchants
  const recurringTxns = db.prepare(`
    SELECT t.date, t.description, t.amount, COALESCE(c.name, 'Uncategorized') as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.normalized_merchant IS NOT NULL
      AND strftime('%Y-%m', t.date) = ?
    ORDER BY t.amount DESC
    LIMIT 10
  `).all([current.period]) as InsightTransaction[]

  const newMerchantList = newMerchants.length > 0
    ? `New this month: ${newMerchants.join(', ')}.`
    : ''
  const explanation = countDiff >= 2
    ? `${countDiff} new recurring merchants appeared this month. ${newMerchantList} Your total subscription spend is $${current.total_amount.toFixed(0)}/mo.`
    : `Subscription spending increased ${spendChange.toFixed(0)}% from $${previous.total_amount.toFixed(0)} to $${current.total_amount.toFixed(0)} this month.`

  const breakdown = currentMerchants.slice(0, 5).map(m => {
    const curAmount = (db.prepare(`
      SELECT SUM(amount) as total FROM transactions
      WHERE normalized_merchant = ? AND type = 'debit' AND strftime('%Y-%m', date) = ?
    `).get([m.merchant, current.period]) as { total: number })?.total ?? 0
    const prevAmount = (db.prepare(`
      SELECT SUM(amount) as total FROM transactions
      WHERE normalized_merchant = ? AND type = 'debit' AND strftime('%Y-%m', date) = ?
    `).get([m.merchant, previous.period]) as { total: number | null })?.total ?? 0
    return { label: m.merchant, current: curAmount, previous: prevAmount }
  })

  const detail: InsightDetail = {
    periodLabel: `${previous.period} vs ${current.period}`,
    breakdown,
    explanation,
    transactions: recurringTxns,
  }

  const card: InsightCard = {
    id: 'recurring-growth',
    type: 'recurring_charges',
    severity: countDiff >= 2 ? 'concerning' : 'notable',
    headline,
    metric,
    percentChange: spendChange,
    dollarChange: dollarDiff,
    score: 0,
    sparkline,
    detail,
  }
  card.score = scoreInsight(card, daysAgoFromPeriod(current.period))
  insights.push(card)

  return insights
}

export function detectSpendingShifts(db: Database.Database): InsightCard[] {
  // Get spending by category per month for last 6 months
  const allRows = db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COALESCE(c.name, 'Uncategorized') as category,
      SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-6 months')
    GROUP BY period, category
    ORDER BY period ASC
  `).all() as PeriodSpending[]

  const allPeriods = [...new Set(allRows.map(r => r.period))].sort()
  if (allPeriods.length < 2) return []

  const currentPeriod = allPeriods[allPeriods.length - 1]
  const previousPeriod = allPeriods[allPeriods.length - 2]

  const currentRows = allRows.filter(r => r.period === currentPeriod).map(r => ({ category: r.category, amount: r.amount }))
  const previousRows = allRows.filter(r => r.period === previousPeriod).map(r => ({ category: r.category, amount: r.amount }))

  const currentTotal = currentRows.reduce((s, r) => s + r.amount, 0)
  const previousTotal = previousRows.reduce((s, r) => s + r.amount, 0)

  if (currentTotal === 0 || previousTotal === 0) return []

  const currentMap = new Map(currentRows.map(r => [r.category, r.amount]))
  const previousMap = new Map(previousRows.map(r => [r.category, r.amount]))

  const allCategories = new Set([...currentMap.keys(), ...previousMap.keys()])

  const shifts: CategoryShare[] = []
  for (const cat of allCategories) {
    const cur = currentMap.get(cat) ?? 0
    const prev = previousMap.get(cat) ?? 0
    const currentPct = (cur / currentTotal) * 100
    const previousPct = (prev / previousTotal) * 100
    shifts.push({
      category: cat,
      current_pct: currentPct,
      previous_pct: previousPct,
      current_amount: cur,
      previous_amount: prev,
    })
  }

  // Find pairs where one went up significantly and another went down
  const increased = shifts.filter(s => s.current_pct - s.previous_pct > 5).sort((a, b) => (b.current_pct - b.previous_pct) - (a.current_pct - a.previous_pct))
  const decreased = shifts.filter(s => s.previous_pct - s.current_pct > 5).sort((a, b) => (b.previous_pct - b.current_pct) - (a.previous_pct - a.current_pct))

  if (increased.length === 0 || decreased.length === 0) return []

  const insights: InsightCard[] = []

  // Report the most significant shift pair
  const up = increased[0]
  const down = decreased[0]

  const upPctDiff = up.current_pct - up.previous_pct
  const downPctDiff = down.previous_pct - down.current_pct
  const dollarDiff = (up.current_amount - up.previous_amount) + (down.previous_amount - down.current_amount)

  const headline = `Shift: ${down.category} down, ${up.category} up`
  const metric = `${up.category} +${upPctDiff.toFixed(0)}pp, ${down.category} -${downPctDiff.toFixed(0)}pp of total spending`

  // Sparkline: show category % composition for recent months (reuse allRows)
  const periodTotals = new Map<string, number>()
  for (const r of allRows) {
    periodTotals.set(r.period, (periodTotals.get(r.period) ?? 0) + r.amount)
  }

  // Sparkline for the increasing category's share
  const periods = [...periodTotals.keys()].sort()
  const sparkline: SparklinePoint[] = periods.map(p => {
    const catAmount = allRows.find(r => r.period === p && r.category === up.category)?.amount ?? 0
    const total = periodTotals.get(p) ?? 1
    return { label: p, value: Math.round((catAmount / total) * 100) }
  })

  // Get transactions from the increasing category
  const shiftTxns = db.prepare(`
    SELECT t.date, t.description, t.amount, COALESCE(c.name, 'Uncategorized') as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit'
      AND COALESCE(c.name, 'Uncategorized') IN (?, ?)
      AND strftime('%Y-%m', t.date) = ?
    ORDER BY t.amount DESC
    LIMIT 10
  `).all([up.category, down.category, currentPeriod]) as InsightTransaction[]

  const explanation = `Your spending is shifting from ${down.category} to ${up.category}. ${up.category} went from $${up.previous_amount.toFixed(0)} to $${up.current_amount.toFixed(0)} (+${upPctDiff.toFixed(0)} percentage points of total), while ${down.category} dropped from $${down.previous_amount.toFixed(0)} to $${down.current_amount.toFixed(0)} (-${downPctDiff.toFixed(0)}pp).`

  const detail: InsightDetail = {
    periodLabel: 'Last month vs previous month',
    breakdown: [
      { label: up.category, current: up.current_amount, previous: up.previous_amount },
      { label: down.category, current: down.current_amount, previous: down.previous_amount },
    ],
    explanation,
    transactions: shiftTxns,
  }

  const card: InsightCard = {
    id: `shift-${up.category.toLowerCase().replace(/\s+/g, '-')}-${down.category.toLowerCase().replace(/\s+/g, '-')}`,
    type: 'spending_shift',
    severity: 'informational',
    headline,
    metric,
    percentChange: upPctDiff,
    dollarChange: dollarDiff,
    score: 0,
    sparkline,
    detail,
  }
  card.score = scoreInsight(card, 15) // current month data
  insights.push(card)

  return insights
}
