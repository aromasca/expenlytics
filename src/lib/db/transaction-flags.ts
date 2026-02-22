import type Database from 'better-sqlite3'

export interface TransactionFlag {
  id: number
  transaction_id: number
  flag_type: 'duplicate' | 'category_mismatch' | 'suspicious'
  details: Record<string, unknown> | null
  resolution: string | null
  resolved_at: string | null
  created_at: string
}

export interface FlagWithTransaction extends TransactionFlag {
  date: string
  description: string
  amount: number
  type: string
  document_id: number
  category_name: string | null
  normalized_merchant: string | null
}

export function createFlag(
  db: Database.Database,
  transactionId: number,
  flagType: 'duplicate' | 'category_mismatch' | 'suspicious',
  details?: Record<string, unknown>
): number {
  const existing = db.prepare(
    'SELECT id FROM transaction_flags WHERE transaction_id = ? AND flag_type = ?'
  ).get(transactionId, flagType) as { id: number } | undefined

  if (existing) return existing.id

  return Number(db.prepare(
    'INSERT INTO transaction_flags (transaction_id, flag_type, details) VALUES (?, ?, ?)'
  ).run(transactionId, flagType, details ? JSON.stringify(details) : null).lastInsertRowid)
}

export function resolveFlag(
  db: Database.Database,
  flagId: number,
  resolution: 'removed' | 'kept' | 'fixed' | 'dismissed'
): void {
  db.prepare(
    "UPDATE transaction_flags SET resolution = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(resolution, flagId)
}

export function resolveFlags(
  db: Database.Database,
  flagIds: number[],
  resolution: 'removed' | 'kept' | 'fixed' | 'dismissed'
): number {
  if (flagIds.length === 0) return 0
  const placeholders = flagIds.map(() => '?').join(', ')
  const result = db.prepare(
    `UPDATE transaction_flags SET resolution = ?, resolved_at = datetime('now') WHERE id IN (${placeholders})`
  ).run(resolution, ...flagIds)
  return result.changes
}

export function getFlagsForTransaction(db: Database.Database, transactionId: number): TransactionFlag[] {
  const rows = db.prepare(
    'SELECT * FROM transaction_flags WHERE transaction_id = ?'
  ).all(transactionId) as Array<Omit<TransactionFlag, 'details'> & { details: string | null }>

  return rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  }))
}

export function getUnresolvedFlags(db: Database.Database, flagType?: string): FlagWithTransaction[] {
  const typeFilter = flagType ? 'AND tf.flag_type = ?' : ''
  const params = flagType ? [flagType] : []

  const rows = db.prepare(`
    SELECT tf.*, t.date, t.description, t.amount, t.type, t.document_id, t.normalized_merchant,
           c.name as category_name
    FROM transaction_flags tf
    JOIN transactions t ON tf.transaction_id = t.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE tf.resolution IS NULL ${typeFilter}
    ORDER BY t.date DESC
  `).all(params) as Array<Omit<FlagWithTransaction, 'details'> & { details: string | null }>

  return rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  }))
}

export function getUnresolvedFlagCount(db: Database.Database): number {
  return (db.prepare(
    'SELECT COUNT(*) as count FROM transaction_flags WHERE resolution IS NULL'
  ).get() as { count: number }).count
}

export function clearFlagsForDocument(db: Database.Database, documentId: number): void {
  db.prepare(`
    DELETE FROM transaction_flags
    WHERE transaction_id IN (SELECT id FROM transactions WHERE document_id = ?)
  `).run(documentId)
}
