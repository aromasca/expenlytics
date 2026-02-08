import type Database from 'better-sqlite3'

interface MonthlyCategorySpend {
  period: string
  category: string
  amount: number
}

interface MerchantSpend {
  merchant: string
  total: number
  count: number
}

interface OutlierTransaction {
  date: string
  description: string
  amount: number
  category: string
  category_avg: number
}

export interface DataSummary {
  monthly_by_category: Array<{ period: string; category: string; amount: number }>
  top_merchants: Array<{ merchant: string; total: number; count: number }>
  category_changes: Array<{ category: string; current: number; previous: number; change_pct: number }>
  outliers: Array<{ date: string; description: string; amount: number; category: string; multiple: number }>
  metadata: { date_range: string; transaction_count: number; total_spend: number }
}

export function buildDataSummary(db: Database.Database): DataSummary {
  // Monthly spending by category (last 6 months)
  const monthlyRows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as period,
           COALESCE(c.name, 'Uncategorized') as category,
           SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    GROUP BY period, category
    ORDER BY period ASC, amount DESC
  `).all() as MonthlyCategorySpend[]

  // Top 20 merchants by spend
  const topMerchants = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as merchant,
           SUM(t.amount) as total,
           COUNT(*) as count
    FROM transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    GROUP BY merchant
    ORDER BY total DESC
    LIMIT 20
  `).all() as MerchantSpend[]

  // Category changes: current vs previous month
  const periods = [...new Set(monthlyRows.map(r => r.period))].sort()
  const categoryChanges: DataSummary['category_changes'] = []
  if (periods.length >= 2) {
    const cur = periods[periods.length - 1]
    const prev = periods[periods.length - 2]
    const curMap = new Map<string, number>()
    const prevMap = new Map<string, number>()
    for (const r of monthlyRows) {
      if (r.period === cur) curMap.set(r.category, r.amount)
      if (r.period === prev) prevMap.set(r.category, r.amount)
    }
    const allCats = new Set([...curMap.keys(), ...prevMap.keys()])
    for (const cat of allCats) {
      const c = curMap.get(cat) ?? 0
      const p = prevMap.get(cat) ?? 0
      if (p === 0 && c === 0) continue
      const pct = p === 0 ? 100 : ((c - p) / p) * 100
      categoryChanges.push({ category: cat, current: c, previous: p, change_pct: Math.round(pct) })
    }
    categoryChanges.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
  }

  // Outlier transactions (>2x category average)
  const outliers = db.prepare(`
    SELECT t.date, t.description, t.amount,
           COALESCE(c.name, 'Uncategorized') as category,
           cat_avg.avg_amount as category_avg
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    JOIN (
      SELECT category_id, AVG(amount) as avg_amount
      FROM transactions
      WHERE type = 'debit' AND date >= date('now', '-6 months')
      GROUP BY category_id
    ) cat_avg ON t.category_id = cat_avg.category_id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-3 months')
      AND t.amount > cat_avg.avg_amount * 2
    ORDER BY t.amount DESC
    LIMIT 10
  `).all() as OutlierTransaction[]

  // Metadata
  const meta = db.prepare(`
    SELECT MIN(date) as min_date, MAX(date) as max_date,
           COUNT(*) as count, SUM(amount) as total
    FROM transactions
    WHERE type = 'debit' AND date >= date('now', '-6 months')
  `).get() as { min_date: string; max_date: string; count: number; total: number }

  return {
    monthly_by_category: monthlyRows,
    top_merchants: topMerchants,
    category_changes: categoryChanges.slice(0, 10),
    outliers: outliers.map(o => ({
      date: o.date,
      description: o.description,
      amount: o.amount,
      category: o.category,
      multiple: Math.round((o.amount / o.category_avg) * 10) / 10,
    })),
    metadata: {
      date_range: `${meta.min_date ?? 'N/A'} to ${meta.max_date ?? 'N/A'}`,
      transaction_count: meta.count ?? 0,
      total_spend: meta.total ?? 0,
    },
  }
}
