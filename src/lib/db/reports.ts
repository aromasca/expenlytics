import type Database from 'better-sqlite3'

export interface ReportFilters {
  start_date?: string
  end_date?: string
  category_ids?: number[]
  type?: 'debit' | 'credit'
  document_id?: number
}

interface SpendingSummary {
  totalSpent: number
  totalIncome: number
  avgMonthly: number
  topCategory: { name: string; amount: number }
}

interface SpendingOverTimeRow {
  period: string
  amount: number
}

interface CategoryBreakdownRow {
  category: string
  color: string
  amount: number
  percentage: number
}

interface SpendingTrendRow {
  period: string
  debits: number
  credits: number
}

interface TopTransactionRow {
  id: number
  date: string
  description: string
  amount: number
  type: string
  category: string | null
}

function buildWhere(filters: ReportFilters): { where: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
  }
  if (filters.type) {
    conditions.push('t.type = ?')
    params.push(filters.type)
  }
  if (filters.document_id !== undefined) {
    conditions.push('t.document_id = ?')
    params.push(filters.document_id)
  }
  if (filters.category_ids && filters.category_ids.length > 0) {
    const placeholders = filters.category_ids.map(() => '?').join(', ')
    conditions.push(`t.category_id IN (${placeholders})`)
    params.push(...filters.category_ids)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

export function getSpendingSummary(db: Database.Database, filters: ReportFilters): SpendingSummary {
  const { where, params } = buildWhere(filters)

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as totalSpent,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as totalIncome
    FROM valid_transactions t
    ${where}
  `).get(params) as { totalSpent: number; totalIncome: number }

  const monthCount = db.prepare(`
    SELECT COUNT(DISTINCT strftime('%Y-%m', t.date)) as months
    FROM valid_transactions t
    ${where}
  `).get(params) as { months: number }

  const avgMonthly = monthCount.months > 0
    ? Math.round((totals.totalSpent / monthCount.months) * 100) / 100
    : 0

  // For top category, we need the base where clause PLUS type = 'debit'
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where: debitWhere, params: debitParams } = buildWhere(debitFilters)

  const topCat = db.prepare(`
    SELECT t.category_name as name, SUM(t.amount) as amount
    FROM valid_transactions t
    ${debitWhere}
    GROUP BY t.category_id
    ORDER BY amount DESC
    LIMIT 1
  `).get(debitParams) as { name: string; amount: number } | undefined

  return {
    totalSpent: totals.totalSpent,
    totalIncome: totals.totalIncome,
    avgMonthly,
    topCategory: topCat ?? { name: 'None', amount: 0 },
  }
}

export function getSpendingOverTime(
  db: Database.Database,
  filters: ReportFilters,
  groupBy: 'month' | 'quarter' | 'year'
): SpendingOverTimeRow[] {
  const debitFilters = { ...filters, type: filters.type ?? 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  let periodExpr: string
  switch (groupBy) {
    case 'month':
      periodExpr = "strftime('%Y-%m', t.date)"
      break
    case 'quarter':
      periodExpr = "strftime('%Y', t.date) || '-Q' || ((cast(strftime('%m', t.date) as integer) - 1) / 3 + 1)"
      break
    case 'year':
      periodExpr = "strftime('%Y', t.date)"
      break
  }

  return db.prepare(`
    SELECT ${periodExpr} as period, SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingOverTimeRow[]
}

export function getCategoryBreakdown(db: Database.Database, filters: ReportFilters): CategoryBreakdownRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  const rows = db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY t.category_id
    ORDER BY amount DESC
  `).all(params) as Array<{ category: string; color: string; amount: number }>

  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return rows.map(r => ({
    ...r,
    percentage: total > 0 ? Math.round((r.amount / total) * 10000) / 100 : 0,
  }))
}

export function getSpendingTrend(db: Database.Database, filters: ReportFilters): SpendingTrendRow[] {
  const { type: _type, ...filtersWithoutType } = filters // eslint-disable-line @typescript-eslint/no-unused-vars
  const { where, params } = buildWhere(filtersWithoutType)

  return db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as debits,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as credits
    FROM valid_transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingTrendRow[]
}

export interface SankeyRow {
  category: string
  category_group: string
  color: string
  amount: number
}

export function getSankeyData(db: Database.Database, filters: ReportFilters): SankeyRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  return db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_group, 'Other') as category_group,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY t.category_id
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(params) as SankeyRow[]
}

export function getSankeyIncomeData(db: Database.Database, filters: ReportFilters): SankeyRow[] {
  const creditFilters = { ...filters, type: 'credit' as const }
  const { where, params } = buildWhere(creditFilters)

  return db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_group, 'Other') as category_group,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY t.category_id
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(params) as SankeyRow[]
}

export interface MoMComparisonRow {
  group: string
  current: number
  previous: number
  delta: number
  percentChange: number
}

export function getMoMComparison(db: Database.Database, filters: ReportFilters): MoMComparisonRow[] {
  const { type: _type, ...filtersWithoutType } = filters // eslint-disable-line @typescript-eslint/no-unused-vars
  const { where, params } = buildWhere(filtersWithoutType)

  const months = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', t.date) as month
    FROM valid_transactions t
    ${where}
    ORDER BY month DESC
    LIMIT 2
  `).all(params) as Array<{ month: string }>

  if (months.length < 2) return []

  const currentMonth = months[0].month
  const previousMonth = months[1].month

  const rows = db.prepare(`
    SELECT
      COALESCE(t.category_group, 'Other') as grp,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as current_amount,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as previous_amount
    FROM valid_transactions t
    ${where}${where ? ' AND' : ' WHERE'} t.type = 'debit'
      AND strftime('%Y-%m', t.date) IN (?, ?)
    GROUP BY COALESCE(t.category_group, 'Other')
    HAVING current_amount > 0 OR previous_amount > 0
  `).all([...params, currentMonth, previousMonth, currentMonth, previousMonth]) as Array<{ grp: string; current_amount: number; previous_amount: number }>

  return rows
    .map(r => {
      const delta = r.current_amount - r.previous_amount
      const percentChange = r.previous_amount > 0 ? Math.round((delta / r.previous_amount) * 1000) / 10 : (r.current_amount > 0 ? 100 : 0)
      return {
        group: r.grp,
        current: r.current_amount,
        previous: r.previous_amount,
        delta,
        percentChange,
      }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

export function getTopTransactions(
  db: Database.Database,
  filters: ReportFilters,
  limit: number = 10
): TopTransactionRow[] {
  const { where, params } = buildWhere(filters)

  return db.prepare(`
    SELECT t.id, t.date, t.description, t.amount, t.type,
           t.category_name as category
    FROM valid_transactions t
    ${where}
    ORDER BY t.amount DESC
    LIMIT ?
  `).all([...params, limit]) as TopTransactionRow[]
}
