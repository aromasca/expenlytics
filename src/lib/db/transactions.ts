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

export function updateTransactionCategory(db: Database.Database, transactionId: number, categoryId: number): void {
  db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(categoryId, transactionId)
}
