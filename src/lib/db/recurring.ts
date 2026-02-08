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

export function getDismissedMerchants(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT normalized_merchant FROM dismissed_subscriptions').all() as Array<{ normalized_merchant: string }>
  return new Set(rows.map(r => r.normalized_merchant))
}

export function dismissMerchant(db: Database.Database, merchant: string): void {
  db.prepare('INSERT OR IGNORE INTO dismissed_subscriptions (normalized_merchant) VALUES (?)').run(merchant)
}

export function restoreMerchant(db: Database.Database, merchant: string): void {
  db.prepare('DELETE FROM dismissed_subscriptions WHERE normalized_merchant = ?').run(merchant)
}

export function mergeMerchants(db: Database.Database, merchants: string[], targetName: string): number {
  const transaction = db.transaction(() => {
    const placeholders = merchants.map(() => '?').join(', ')
    const result = db.prepare(
      `UPDATE transactions SET normalized_merchant = ? WHERE normalized_merchant IN (${placeholders})`
    ).run(targetName, ...merchants)

    // Clean up dismissed entries for merged-away merchants
    const mergedAway = merchants.filter(m => m !== targetName)
    if (mergedAway.length > 0) {
      const dismissPlaceholders = mergedAway.map(() => '?').join(', ')
      db.prepare(
        `DELETE FROM dismissed_subscriptions WHERE normalized_merchant IN (${dismissPlaceholders})`
      ).run(...mergedAway)
    }

    return result.changes
  })

  return transaction()
}
