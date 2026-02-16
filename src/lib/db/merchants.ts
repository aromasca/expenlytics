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
    FROM transactions t
    LEFT JOIN categories c ON c.id = (
      SELECT t2.category_id FROM transactions t2
      WHERE t2.normalized_merchant = t.normalized_merchant AND t2.category_id IS NOT NULL
      GROUP BY t2.category_id ORDER BY COUNT(*) DESC LIMIT 1
    )
    ${where}
    GROUP BY t.normalized_merchant
    ORDER BY COUNT(*) DESC
  `).all(params) as MerchantInfo[]

  return rows
}
