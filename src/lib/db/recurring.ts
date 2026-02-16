import type Database from 'better-sqlite3'
import { detectRecurringGroups, type RecurringGroup, type TransactionForRecurring } from '@/lib/recurring'

export interface RecurringFilters {
  start_date?: string
  end_date?: string
  excludeMerchants?: Set<string>
}

export function getRecurringCharges(db: Database.Database, filters: RecurringFilters): RecurringGroup[] {
  const conditions: string[] = ["t.type = 'debit'", "t.normalized_merchant IS NOT NULL", "COALESCE(c.exclude_from_totals, 0) = 0", "t.id NOT IN (SELECT transaction_id FROM excluded_recurring_transactions)"]
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

  const groups = detectRecurringGroups(rows)
  if (filters.excludeMerchants && filters.excludeMerchants.size > 0) {
    return groups.filter(g => !filters.excludeMerchants!.has(g.merchantName))
  }
  return groups
}

export interface SubscriptionStatusEntry {
  status: 'ended' | 'not_recurring'
  statusChangedAt: string
  notes: string | null
}

export function setSubscriptionStatus(
  db: Database.Database,
  merchant: string,
  status: 'active' | 'ended' | 'not_recurring',
  notes?: string,
  statusDate?: string
): void {
  if (status === 'active') {
    db.prepare('DELETE FROM subscription_status WHERE normalized_merchant = ?').run(merchant)
  } else {
    db.prepare(`
      INSERT INTO subscription_status (normalized_merchant, status, notes, status_changed_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')))
      ON CONFLICT(normalized_merchant) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        status_changed_at = excluded.status_changed_at
    `).run(merchant, status, notes ?? null, statusDate ?? null)
  }
}

export function getSubscriptionStatuses(db: Database.Database): Map<string, SubscriptionStatusEntry> {
  const rows = db.prepare(
    'SELECT normalized_merchant, status, status_changed_at, notes FROM subscription_status'
  ).all() as Array<{ normalized_merchant: string; status: 'ended' | 'not_recurring'; status_changed_at: string; notes: string | null }>
  const map = new Map<string, SubscriptionStatusEntry>()
  for (const r of rows) {
    map.set(r.normalized_merchant, { status: r.status, statusChangedAt: r.status_changed_at, notes: r.notes })
  }
  return map
}

export function getExcludedMerchants(db: Database.Database): Set<string> {
  const rows = db.prepare(
    "SELECT normalized_merchant FROM subscription_status WHERE status = 'not_recurring'"
  ).all() as Array<{ normalized_merchant: string }>
  return new Set(rows.map(r => r.normalized_merchant))
}

export function mergeMerchants(db: Database.Database, merchants: string[], targetName: string): number {
  const transaction = db.transaction(() => {
    const placeholders = merchants.map(() => '?').join(', ')
    const result = db.prepare(
      `UPDATE transactions SET normalized_merchant = ? WHERE normalized_merchant IN (${placeholders})`
    ).run(targetName, ...merchants)

    // Clean up subscription status entries for merged-away merchants
    const mergedAway = merchants.filter(m => m !== targetName)
    if (mergedAway.length > 0) {
      const statusPlaceholders = mergedAway.map(() => '?').join(', ')
      db.prepare(
        `DELETE FROM subscription_status WHERE normalized_merchant IN (${statusPlaceholders})`
      ).run(...mergedAway)
    }

    return result.changes
  })

  return transaction()
}

export function excludeTransactionFromRecurring(db: Database.Database, transactionId: number): void {
  db.prepare('INSERT OR IGNORE INTO excluded_recurring_transactions (transaction_id) VALUES (?)').run(transactionId)
}

export function restoreTransactionToRecurring(db: Database.Database, transactionId: number): void {
  db.prepare('DELETE FROM excluded_recurring_transactions WHERE transaction_id = ?').run(transactionId)
}
