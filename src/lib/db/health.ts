import type Database from 'better-sqlite3'
import type { MonthlyFlow } from '@/lib/insights/types'

export function getMonthlyIncomeVsSpending(db: Database.Database): MonthlyFlow[] {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' AND COALESCE(c.name, '') NOT IN ('Transfer', 'Refund')
               THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date >= date('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{ month: string; income: number; spending: number }>

  return rows.map(r => ({
    month: r.month,
    income: Math.round(r.income * 100) / 100,
    spending: Math.round(r.spending * 100) / 100,
    net: Math.round((r.income - r.spending) * 100) / 100,
  }))
}
