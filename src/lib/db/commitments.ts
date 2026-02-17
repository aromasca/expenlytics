import type Database from 'better-sqlite3'
import { detectCommitmentGroups, type CommitmentGroup, type TransactionForCommitment } from '@/lib/commitments'

export interface CommitmentFilters {
  start_date?: string
  end_date?: string
  excludeMerchants?: Set<string>
}

export function getCommitments(db: Database.Database, filters: CommitmentFilters): CommitmentGroup[] {
  const conditions: string[] = ["t.type = 'debit'", "t.normalized_merchant IS NOT NULL", "COALESCE(c.exclude_from_totals, 0) = 0", "t.id NOT IN (SELECT transaction_id FROM excluded_commitment_transactions)"]
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
  `).all(params) as TransactionForCommitment[]

  const groups = detectCommitmentGroups(rows)
  if (filters.excludeMerchants && filters.excludeMerchants.size > 0) {
    return groups.filter(g => !filters.excludeMerchants!.has(g.merchantName))
  }
  return groups
}

export interface CommitmentStatusEntry {
  status: 'ended' | 'not_recurring'
  statusChangedAt: string
  notes: string | null
}

export function setCommitmentStatus(
  db: Database.Database,
  merchant: string,
  status: 'active' | 'ended' | 'not_recurring',
  notes?: string,
  statusDate?: string
): void {
  if (status === 'active') {
    db.prepare('DELETE FROM commitment_status WHERE normalized_merchant = ?').run(merchant)
  } else {
    db.prepare(`
      INSERT INTO commitment_status (normalized_merchant, status, notes, status_changed_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')))
      ON CONFLICT(normalized_merchant) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        status_changed_at = excluded.status_changed_at
    `).run(merchant, status, notes ?? null, statusDate ?? null)
  }
}

export function getCommitmentStatuses(db: Database.Database): Map<string, CommitmentStatusEntry> {
  const rows = db.prepare(
    'SELECT normalized_merchant, status, status_changed_at, notes FROM commitment_status'
  ).all() as Array<{ normalized_merchant: string; status: 'ended' | 'not_recurring'; status_changed_at: string; notes: string | null }>
  const map = new Map<string, CommitmentStatusEntry>()
  for (const r of rows) {
    map.set(r.normalized_merchant, { status: r.status, statusChangedAt: r.status_changed_at, notes: r.notes })
  }
  return map
}

export function getExcludedMerchants(db: Database.Database): Set<string> {
  const rows = db.prepare(
    "SELECT normalized_merchant FROM commitment_status WHERE status = 'not_recurring'"
  ).all() as Array<{ normalized_merchant: string }>
  return new Set(rows.map(r => r.normalized_merchant))
}

export function mergeMerchants(db: Database.Database, merchants: string[], targetName: string): number {
  const transaction = db.transaction(() => {
    const placeholders = merchants.map(() => '?').join(', ')
    const result = db.prepare(
      `UPDATE transactions SET normalized_merchant = ? WHERE normalized_merchant IN (${placeholders})`
    ).run(targetName, ...merchants)

    // Clean up commitment status entries for merged-away merchants
    const mergedAway = merchants.filter(m => m !== targetName)
    if (mergedAway.length > 0) {
      const statusPlaceholders = mergedAway.map(() => '?').join(', ')
      db.prepare(
        `DELETE FROM commitment_status WHERE normalized_merchant IN (${statusPlaceholders})`
      ).run(...mergedAway)
    }

    return result.changes
  })

  return transaction()
}

export function excludeTransactionFromCommitments(db: Database.Database, transactionId: number): void {
  db.prepare('INSERT OR IGNORE INTO excluded_commitment_transactions (transaction_id) VALUES (?)').run(transactionId)
}

export function restoreTransactionToCommitments(db: Database.Database, transactionId: number): void {
  db.prepare('DELETE FROM excluded_commitment_transactions WHERE transaction_id = ?').run(transactionId)
}
