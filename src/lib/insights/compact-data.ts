import type Database from 'better-sqlite3'
import { detectCommitmentGroups, applyCommitmentOverrides, type TransactionForCommitment } from '@/lib/commitments'
import { getCommitmentOverrides } from '@/lib/db/commitments'

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
  active_commitments: Array<{
    merchant: string
    frequency: string
    estimated_monthly: number
    recent_amounts: number[]
    first_seen: string
    last_seen: string
    category: string
    account?: string
  }>
  commitment_baseline: {
    total_monthly: number
    count: number
  }
  account_summaries: Array<{
    name: string
    type: string
    months: Record<string, { spending: number; income: number; txn_count: number }>
    top_categories: Array<{ category: string; total: number }>
    top_merchants: Array<{ name: string; total: number }>
  }>
  outliers: Array<{ date: string; description: string; amount: number; category: string }>
  top_merchants_by_category: Array<{ category: string; merchants: Array<{ name: string; total: number; count: number }> }>
  recent_transactions: Array<{
    date: string; description: string; normalized_merchant: string | null;
    amount: number; type: string; category: string; transaction_class: string | null
  }>
  merchant_month_deltas: Array<{ merchant: string; months: Record<string, number> }>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function buildCompactData(db: Database.Database): CompactFinancialData {
  // Monthly income vs spending (last 12 months)
  // Exclude Transfer and Refund from income
  const monthlyRows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM valid_transactions t
    WHERE t.date >= date('now', '-12 months')
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
    SELECT COALESCE(t.category_name, 'Uncategorized') as category,
           strftime('%Y-%m', t.date) as month,
           SUM(t.amount) as amount
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
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
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-12 months')
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
      FROM valid_transactions t
      WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
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
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-60 days')
    GROUP BY t.date
    ORDER BY t.date ASC
  `).all() as Array<{ date: string; amount: number }>

  const daily_recent = dailyRows.map(r => ({
    date: r.date,
    amount: Math.round(r.amount * 100) / 100,
    is_income_day: incomeDates.has(r.date),
  }))

  // Active commitments via detectCommitmentGroups (same logic as commitments page)
  const endedMerchants = new Set(
    (db.prepare(`SELECT normalized_merchant FROM commitment_status WHERE status IN ('ended', 'not_recurring')`).all() as Array<{ normalized_merchant: string }>)
      .map(r => r.normalized_merchant.toLowerCase())
  )
  const excludedTxIds = new Set(
    (db.prepare(`SELECT transaction_id FROM excluded_commitment_transactions`).all() as Array<{ transaction_id: number }>)
      .map(r => r.transaction_id)
  )

  const commitmentTxns = db.prepare(`
    SELECT t.id, t.date, t.description, t.normalized_merchant, t.amount, t.type,
           t.category_name, t.category_color
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.normalized_merchant IS NOT NULL
  `).all() as TransactionForCommitment[]

  const filteredTxns = commitmentTxns.filter(t => !excludedTxIds.has(t.id))
  const allGroups = detectCommitmentGroups(filteredTxns)
  const overrides = getCommitmentOverrides(db)
  applyCommitmentOverrides(allGroups, overrides)
  const activeGroups = allGroups.filter(g => !endedMerchants.has(g.merchantName.toLowerCase()))

  // Build account lookup: transaction_id → account label
  const txAccountRows = db.prepare(`
    SELECT t.id as txn_id, a.name, a.institution, a.last_four
    FROM transactions t
    JOIN documents d ON t.document_id = d.id
    JOIN document_accounts da ON da.document_id = d.id
    JOIN accounts a ON da.account_id = a.id
  `).all() as Array<{ txn_id: number; name: string; institution: string | null; last_four: string | null }>

  const txAccountMap = new Map<number, string>()
  for (const r of txAccountRows) {
    const label = `${r.institution ?? r.name}${r.last_four ? ' (...' + r.last_four + ')' : ''}`
    txAccountMap.set(r.txn_id, label)
  }

  const active_commitments: CompactFinancialData['active_commitments'] = activeGroups.map(g => {
    // Last 4 transaction amounts for drift detection
    const sortedIds = g.transactionIds.slice()
    const txnsByDate = filteredTxns
      .filter(t => sortedIds.includes(t.id))
      .sort((a, b) => a.date.localeCompare(b.date))
    const recent_amounts = txnsByDate.slice(-4).map(t => t.amount)

    // Find account from any transaction in this group
    let account: string | undefined
    for (const tid of g.transactionIds) {
      if (txAccountMap.has(tid)) {
        account = txAccountMap.get(tid)
        break
      }
    }

    return {
      merchant: g.merchantName,
      frequency: g.frequency,
      estimated_monthly: g.estimatedMonthlyAmount,
      recent_amounts,
      first_seen: g.firstDate,
      last_seen: g.lastDate,
      category: g.category ?? 'Uncategorized',
      ...(account ? { account } : {}),
    }
  })

  const commitment_baseline: CompactFinancialData['commitment_baseline'] = {
    total_monthly: Math.round(active_commitments.reduce((s, c) => s + c.estimated_monthly, 0) * 100) / 100,
    count: active_commitments.length,
  }

  // Outlier transactions (last 3 months, >2x category average)
  const outliers = db.prepare(`
    SELECT t.date, t.description, t.amount,
           COALESCE(t.category_name, 'Uncategorized') as category
    FROM valid_transactions t
    JOIN (
      SELECT t2.category_id, AVG(t2.amount) as avg_amount
      FROM valid_transactions t2
      WHERE t2.type = 'debit' AND t2.date >= date('now', '-6 months')
      GROUP BY t2.category_id
    ) cat_avg ON t.category_id = cat_avg.category_id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-3 months')
      AND t.amount > cat_avg.avg_amount * 2
    ORDER BY t.amount DESC
    LIMIT 10
  `).all() as Array<{ date: string; description: string; amount: number; category: string }>

  // Top merchants per category (top 5 merchants for top 10 categories)
  const merchantByCatRows = db.prepare(`
    SELECT COALESCE(t.category_name, 'Uncategorized') as category,
           COALESCE(t.normalized_merchant, t.description) as merchant_name,
           SUM(t.amount) as total,
           COUNT(*) as count
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    GROUP BY COALESCE(t.category_name, 'Uncategorized'), COALESCE(t.normalized_merchant, t.description)
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

  // Individual transactions for last 30 days (gives LLM specific purchase context)
  // Capped at 100 to keep payload under ~30KB — aggregated data covers the rest
  const recent_transactions = db.prepare(`
    SELECT t.date, t.description,
           t.normalized_merchant,
           t.amount, t.type,
           COALESCE(t.category_name, 'Uncategorized') as category,
           t.transaction_class
    FROM valid_transactions t
    WHERE t.date >= date('now', '-30 days')
    ORDER BY t.date DESC
    LIMIT 100
  `).all() as CompactFinancialData['recent_transactions']

  // Month-by-month spending for top 20 merchants (lets LLM spot merchant trends)
  const merchantMonthRows = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as merchant,
           strftime('%Y-%m', t.date) as month,
           SUM(t.amount) as total
    FROM valid_transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    GROUP BY COALESCE(t.normalized_merchant, t.description), strftime('%Y-%m', t.date)
    ORDER BY total DESC
  `).all() as Array<{ merchant: string; month: string; total: number }>

  const deltaMap = new Map<string, Record<string, number>>()
  const deltaTotals = new Map<string, number>()
  for (const r of merchantMonthRows) {
    if (!deltaMap.has(r.merchant)) deltaMap.set(r.merchant, {})
    deltaMap.get(r.merchant)![r.month] = Math.round(r.total * 100) / 100
    deltaTotals.set(r.merchant, (deltaTotals.get(r.merchant) ?? 0) + r.total)
  }
  const merchant_month_deltas = [...deltaTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([merchant]) => ({ merchant, months: deltaMap.get(merchant)! }))

  // Account summaries: per-account monthly profiles with top categories/merchants
  const accountRows = db.prepare(`
    SELECT a.id, a.name, a.institution, a.last_four, COALESCE(a.type, 'unknown') as type
    FROM accounts a
    ORDER BY a.name
  `).all() as Array<{ id: number; name: string; institution: string | null; last_four: string | null; type: string }>

  const account_summaries: CompactFinancialData['account_summaries'] = accountRows.map(acct => {
    const label = `${acct.institution ?? acct.name}${acct.last_four ? ' (...' + acct.last_four + ')' : ''}`

    // Monthly profiles
    const monthlyAcctRows = db.prepare(`
      SELECT strftime('%Y-%m', t.date) as month,
             SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending,
             SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
             COUNT(*) as txn_count
      FROM valid_transactions t
      JOIN document_accounts da ON da.document_id = t.document_id
      WHERE da.account_id = ?
      GROUP BY month
      ORDER BY month
    `).all([acct.id]) as Array<{ month: string; spending: number; income: number; txn_count: number }>

    const months: Record<string, { spending: number; income: number; txn_count: number }> = {}
    for (const r of monthlyAcctRows) {
      months[r.month] = {
        spending: Math.round(r.spending * 100) / 100,
        income: Math.round(r.income * 100) / 100,
        txn_count: r.txn_count,
      }
    }

    // Top 3 categories
    const top_categories = db.prepare(`
      SELECT COALESCE(t.category_name, 'Uncategorized') as category, SUM(t.amount) as total
      FROM valid_transactions t
      JOIN document_accounts da ON da.document_id = t.document_id
      WHERE da.account_id = ? AND t.type = 'debit'
      GROUP BY category
      ORDER BY total DESC
      LIMIT 3
    `).all([acct.id]) as Array<{ category: string; total: number }>

    // Top 5 merchants
    const top_merchants = db.prepare(`
      SELECT COALESCE(t.normalized_merchant, t.description) as name, SUM(t.amount) as total
      FROM valid_transactions t
      JOIN document_accounts da ON da.document_id = t.document_id
      WHERE da.account_id = ? AND t.type = 'debit'
      GROUP BY name
      ORDER BY total DESC
      LIMIT 5
    `).all([acct.id]) as Array<{ name: string; total: number }>

    return {
      name: label,
      type: acct.type,
      months,
      top_categories: top_categories.map(r => ({ category: r.category, total: Math.round(r.total * 100) / 100 })),
      top_merchants: top_merchants.map(r => ({ name: r.name, total: Math.round(r.total * 100) / 100 })),
    }
  })

  return { monthly, categories, merchants, day_of_week, daily_recent, active_commitments, commitment_baseline, account_summaries, outliers, top_merchants_by_category, recent_transactions, merchant_month_deltas }
}
