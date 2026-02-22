import type Database from 'better-sqlite3'

export interface MerchantInfo {
  merchant: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
  categoryName: string | null
  categoryColor: string | null
}

export interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

export interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

export function getMerchantDescriptionGroups(db: Database.Database, merchant: string): DescriptionGroup[] {
  return db.prepare(`
    SELECT
      t.description,
      COUNT(*) as transactionCount,
      ROUND(SUM(t.amount), 2) as totalAmount,
      MIN(t.date) as firstDate,
      MAX(t.date) as lastDate
    FROM valid_transactions t
    WHERE t.normalized_merchant = ?
    GROUP BY t.description
    ORDER BY COUNT(*) DESC
  `).all([merchant]) as DescriptionGroup[]
}

export function getMerchantTransactions(db: Database.Database, merchant: string, description?: string): MerchantTransaction[] {
  let sql = 'SELECT t.id, t.date, t.description, t.amount FROM valid_transactions t WHERE t.normalized_merchant = ?'
  const params: unknown[] = [merchant]
  if (description) {
    sql += ' AND t.description = ?'
    params.push(description)
  }
  sql += ' ORDER BY t.date DESC'
  return db.prepare(sql).all(params) as MerchantTransaction[]
}

export function splitMerchant(db: Database.Database, transactionIds: number[], newMerchant: string): number {
  if (transactionIds.length === 0) return 0
  const placeholders = transactionIds.map(() => '?').join(', ')
  const result = db.prepare(
    `UPDATE transactions SET normalized_merchant = ? WHERE id IN (${placeholders})`
  ).run(newMerchant, ...transactionIds)
  return result.changes
}

export function getAllMerchants(db: Database.Database, search?: string): MerchantInfo[] {
  let where = 'WHERE t.normalized_merchant IS NOT NULL'
  const params: unknown[] = []

  if (search) {
    where += ' AND t.normalized_merchant LIKE ?'
    params.push(`%${search}%`)
  }

  const rows = db.prepare(`
    SELECT
      t.normalized_merchant as merchant,
      COUNT(*) as transactionCount,
      ROUND(SUM(t.amount), 2) as totalAmount,
      MIN(t.date) as firstDate,
      MAX(t.date) as lastDate,
      c.name as categoryName,
      c.color as categoryColor
    FROM valid_transactions t
    LEFT JOIN categories c ON c.id = (
      SELECT t2.category_id FROM valid_transactions t2
      WHERE t2.normalized_merchant = t.normalized_merchant AND t2.category_id IS NOT NULL
      GROUP BY t2.category_id ORDER BY COUNT(*) DESC LIMIT 1
    )
    ${where}
    GROUP BY t.normalized_merchant
    ORDER BY COUNT(*) DESC
  `).all(params) as MerchantInfo[]

  return rows
}
