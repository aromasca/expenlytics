import type Database from 'better-sqlite3'
import { detectRecurringGroups, type RecurringGroup, type TransactionForRecurring } from '@/lib/recurring'

export interface RecurringFilters {
  start_date?: string
  end_date?: string
}

export function getRecurringCharges(db: Database.Database, filters: RecurringFilters): RecurringGroup[] {
  const conditions: string[] = ["t.type = 'debit'", "t.normalized_merchant IS NOT NULL"]
  const params: unknown[] = []

  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const rows = db.prepare(`
    SELECT t.id, t.date, t.description, t.normalized_merchant, t.amount, t.type,
           c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.date ASC
  `).all(params) as TransactionForRecurring[]

  return detectRecurringGroups(rows)
}
