import type Database from 'better-sqlite3'

export interface CompactFinancialData {
  monthly: Array<{ month: string; income: number; spending: number; net: number }>
  categories: Array<{ category: string; amounts: Record<string, number> }>
  merchants: Array<{
    name: string; total: number; count: number;
    avg: number; last_seen: string; first_seen: string;
    months_active: number
  }>
  day_of_week: Array<{ day: string; avg_spend: number; transaction_count: number }>
  daily_recent: Array<{ date: string; amount: number; is_income_day: boolean }>
  recurring: Array<{ merchant: string; amount: number; frequency: string; months: number }>
  outliers: Array<{ date: string; description: string; amount: number; category: string }>
  top_merchants_by_category: Array<{ category: string; merchants: Array<{ name: string; total: number; count: number }> }>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function buildCompactData(db: Database.Database): CompactFinancialData {
  // Monthly income vs spending (last 12 months)
  // Exclude Transfer and Refund from income
  const monthlyRows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date >= date('now', '-12 months')
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{ month: string; income: number; spending: number }>

  const monthly = monthlyRows.map(r => ({
    month: r.month,
    income: Math.round(r.income * 100) / 100,
    spending: Math.round(r.spending * 100) / 100,
    net: Math.round((r.income - r.spending) * 100) / 100,
  }))

  // Category spending by month (last 6 months, top 15 categories by total)
  const catRows = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category,
           strftime('%Y-%m', t.date) as month,
           SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    GROUP BY category, month
    ORDER BY amount DESC
  `).all() as Array<{ category: string; month: string; amount: number }>

  const catMap = new Map<string, Record<string, number>>()
  const catTotals = new Map<string, number>()
  for (const r of catRows) {
    if (!catMap.has(r.category)) catMap.set(r.category, {})
    catMap.get(r.category)![r.month] = Math.round(r.amount * 100) / 100
    catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount)
  }
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([cat]) => cat)
  const categories = topCats.map(cat => ({ category: cat, amounts: catMap.get(cat)! }))

  // Merchant profiles (top 30 by frequency + spend)
  const merchants = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as name,
           SUM(t.amount) as total,
           COUNT(*) as count,
           ROUND(AVG(t.amount), 2) as avg,
           MAX(t.date) as last_seen,
           MIN(t.date) as first_seen,
           COUNT(DISTINCT strftime('%Y-%m', t.date)) as months_active
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-12 months')
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    GROUP BY COALESCE(t.normalized_merchant, t.description)
    ORDER BY count DESC, total DESC
    LIMIT 30
  `).all() as CompactFinancialData['merchants']

  // Day-of-week distribution (last 6 months)
  const dowRows = db.prepare(`
    SELECT CAST(strftime('%w', date) AS INTEGER) as dow,
           ROUND(AVG(daily_total), 2) as avg_spend,
           SUM(daily_count) as transaction_count
    FROM (
      SELECT t.date,
             SUM(t.amount) as daily_total,
             COUNT(*) as daily_count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
        AND COALESCE(c.exclude_from_totals, 0) = 0
        AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
      GROUP BY t.date
    )
    GROUP BY CAST(strftime('%w', date) AS INTEGER)
    ORDER BY dow
  `).all() as Array<{ dow: number; avg_spend: number; transaction_count: number }>

  const dowMap = new Map(dowRows.map(r => [r.dow, r]))
  const day_of_week = DAY_NAMES.map((day, i) => ({
    day,
    avg_spend: dowMap.get(i)?.avg_spend ?? 0,
    transaction_count: dowMap.get(i)?.transaction_count ?? 0,
  }))

  // Daily spending for last 60 days with income day flag
  const incomeDates = new Set(
    (db.prepare(`
      SELECT DISTINCT date FROM transactions
      WHERE type = 'credit' AND date >= date('now', '-60 days')
        AND category_id IN (SELECT id FROM categories WHERE name IN ('Salary & Wages', 'Freelance Income'))
    `).all() as Array<{ date: string }>).map(r => r.date)
  )

  const dailyRows = db.prepare(`
    SELECT t.date, SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-60 days')
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    GROUP BY t.date
    ORDER BY t.date ASC
  `).all() as Array<{ date: string; amount: number }>

  const daily_recent = dailyRows.map(r => ({
    date: r.date,
    amount: Math.round(r.amount * 100) / 100,
    is_income_day: incomeDates.has(r.date),
  }))

  // Recurring charges (merchants with 2+ charges, consistent amounts)
  const recurringRows = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as merchant,
           ROUND(AVG(t.amount), 2) as amount,
           COUNT(*) as occurrences,
           COUNT(DISTINCT strftime('%Y-%m', t.date)) as months,
           MIN(t.date) as first_date,
           MAX(t.date) as last_date
    FROM transactions t
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-12 months')
      AND t.normalized_merchant IS NOT NULL
    GROUP BY COALESCE(t.normalized_merchant, t.description)
    HAVING occurrences >= 2
      AND (MAX(t.amount) - MIN(t.amount)) / NULLIF(AVG(t.amount), 0) < 0.3
    ORDER BY amount DESC
  `).all() as Array<{ merchant: string; amount: number; occurrences: number; months: number; first_date: string; last_date: string }>

  const recurring = recurringRows.map(r => {
    const spanDays = (new Date(r.last_date).getTime() - new Date(r.first_date).getTime()) / (1000 * 60 * 60 * 24)
    const avgDays = r.occurrences > 1 ? spanDays / (r.occurrences - 1) : 0
    let frequency = 'irregular'
    if (avgDays <= 10) frequency = 'weekly'
    else if (avgDays <= 45) frequency = 'monthly'
    else if (avgDays <= 120) frequency = 'quarterly'
    else if (avgDays <= 400) frequency = 'yearly'
    return { merchant: r.merchant, amount: r.amount, frequency, months: r.months }
  })

  // Outlier transactions (last 3 months, >2x category average)
  const outliers = db.prepare(`
    SELECT t.date, t.description, t.amount,
           COALESCE(c.name, 'Uncategorized') as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    JOIN (
      SELECT t2.category_id, AVG(t2.amount) as avg_amount
      FROM transactions t2
      LEFT JOIN categories c2 ON t2.category_id = c2.id
      WHERE t2.type = 'debit' AND t2.date >= date('now', '-6 months')
        AND COALESCE(c2.exclude_from_totals, 0) = 0
        AND (t2.transaction_class IS NULL OR t2.transaction_class IN ('purchase', 'fee', 'interest'))
      GROUP BY t2.category_id
    ) cat_avg ON t.category_id = cat_avg.category_id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-3 months')
      AND t.amount > cat_avg.avg_amount * 2
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    ORDER BY t.amount DESC
    LIMIT 10
  `).all() as Array<{ date: string; description: string; amount: number; category: string }>

  // Top merchants per category (top 5 merchants for top 10 categories)
  const merchantByCatRows = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category,
           COALESCE(t.normalized_merchant, t.description) as merchant_name,
           SUM(t.amount) as total,
           COUNT(*) as count
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    GROUP BY COALESCE(c.name, 'Uncategorized'), COALESCE(t.normalized_merchant, t.description)
    ORDER BY category, total DESC
  `).all() as Array<{ category: string; merchant_name: string; total: number; count: number }>

  const catMerchantMap = new Map<string, Array<{ name: string; total: number; count: number }>>()
  for (const r of merchantByCatRows) {
    if (!catMerchantMap.has(r.category)) catMerchantMap.set(r.category, [])
    const arr = catMerchantMap.get(r.category)!
    if (arr.length < 5) {
      arr.push({ name: r.merchant_name, total: Math.round(r.total * 100) / 100, count: r.count })
    }
  }
  const top_merchants_by_category = topCats.slice(0, 10)
    .filter(cat => catMerchantMap.has(cat))
    .map(cat => ({ category: cat, merchants: catMerchantMap.get(cat)! }))

  return { monthly, categories, merchants, day_of_week, daily_recent, recurring, outliers, top_merchants_by_category }
}
