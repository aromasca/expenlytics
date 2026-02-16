import type Database from 'better-sqlite3'

export interface TransactionInput {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
}

export interface TransactionRow {
  id: number
  document_id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
  manual_category: number
  transaction_class: string | null
  created_at: string
}

export interface ListFilters {
  type?: 'debit' | 'credit'
  category_id?: number
  category_ids?: number[]
  search?: string
  start_date?: string
  end_date?: string
  document_id?: number
  transaction_class?: string
  sort_by?: 'date' | 'amount' | 'description'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export function insertTransactions(db: Database.Database, documentId: number, transactions: TransactionInput[]): void {
  const insert = db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, ?, ?, ?, ?)'
  )
  const insertMany = db.transaction((txns: TransactionInput[]) => {
    for (const t of txns) {
      insert.run(documentId, t.date, t.description, t.amount, t.type)
    }
  })
  insertMany(transactions)
}

export function listTransactions(db: Database.Database, filters: ListFilters): { transactions: TransactionRow[]; total: number } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.type) {
    conditions.push('t.type = ?')
    params.push(filters.type)
  }
  if (filters.category_id !== undefined) {
    conditions.push('t.category_id = ?')
    params.push(filters.category_id)
  }
  if (filters.search) {
    conditions.push('t.description LIKE ?')
    params.push(`%${filters.search}%`)
  }
  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
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
  if (filters.transaction_class) {
    conditions.push('t.transaction_class = ?')
    params.push(filters.transaction_class)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const VALID_SORT_BY = ['date', 'amount', 'description'] as const
  const VALID_SORT_ORDER = ['asc', 'desc'] as const

  const sortBy = VALID_SORT_BY.includes(filters.sort_by as typeof VALID_SORT_BY[number]) ? filters.sort_by! : 'date'
  const sortOrder = VALID_SORT_ORDER.includes(filters.sort_order as typeof VALID_SORT_ORDER[number]) ? filters.sort_order! : 'desc'
  const limit = filters.limit ?? 100
  const offset = filters.offset ?? 0

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`).get(params) as { total: number }

  const rows = db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
  `).all([...params, limit, offset]) as TransactionRow[]

  return { transactions: rows, total: countResult.total }
}

export function updateTransactionCategory(db: Database.Database, transactionId: number, categoryId: number, manual: boolean = false): void {
  db.prepare('UPDATE transactions SET category_id = ?, manual_category = ? WHERE id = ?').run(categoryId, manual ? 1 : 0, transactionId)
}


export function updateTransactionType(db: Database.Database, transactionId: number, type: 'debit' | 'credit'): void {
  db.prepare('UPDATE transactions SET type = ? WHERE id = ?').run(type, transactionId)
}

export function updateTransactionClass(db: Database.Database, transactionId: number, transactionClass: string): void {
  db.prepare('UPDATE transactions SET transaction_class = ? WHERE id = ?').run(transactionClass, transactionId)
}

export function bulkUpdateCategories(
  db: Database.Database,
  updates: Array<{ transactionId: number; categoryId: number }>
): void {
  const update = db.prepare(
    'UPDATE transactions SET category_id = ? WHERE id = ? AND manual_category = 0'
  )
  const updateMany = db.transaction((items: typeof updates) => {
    for (const { transactionId, categoryId } of items) {
      update.run(categoryId, transactionId)
    }
  })
  updateMany(updates)
}

export function deleteTransaction(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
}

export function bulkUpdateType(db: Database.Database, ids: number[], type: string): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = db.prepare(`UPDATE transactions SET type = ? WHERE id IN (${placeholders})`).run(type, ...ids)
  return result.changes
}

export function bulkUpdateClass(db: Database.Database, ids: number[], transactionClass: string): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = db.prepare(`UPDATE transactions SET transaction_class = ? WHERE id IN (${placeholders})`).run(transactionClass, ...ids)
  return result.changes
}

export function bulkUpdateCategory(db: Database.Database, ids: number[], categoryId: number): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = db.prepare(`UPDATE transactions SET category_id = ?, manual_category = 1 WHERE id IN (${placeholders})`).run(categoryId, ...ids)
  return result.changes
}

export function deleteTransactions(db: Database.Database, ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...ids)
  return result.changes
}

export function getTransactionsByDocumentId(db: Database.Database, documentId: number): TransactionRow[] {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.document_id = ?
    ORDER BY t.date DESC
  `).all([documentId]) as TransactionRow[]
}
