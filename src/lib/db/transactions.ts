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
  created_at: string
}

export interface ListFilters {
  type?: 'debit' | 'credit'
  category_id?: number
  search?: string
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const sortBy = filters.sort_by ?? 'date'
  const sortOrder = filters.sort_order ?? 'desc'
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

export function findDuplicateTransaction(
  db: Database.Database,
  txn: { date: string; description: string; amount: number; type: string }
): TransactionRow | undefined {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date = ? AND t.description = ? AND t.amount = ? AND t.type = ?
  `).get([txn.date, txn.description, txn.amount, txn.type]) as TransactionRow | undefined
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

export function getTransactionsByDocumentId(db: Database.Database, documentId: number): TransactionRow[] {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.document_id = ?
    ORDER BY t.date DESC
  `).all([documentId]) as TransactionRow[]
}
