import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getAllMerchants } from '@/lib/db/merchants'

function seedTransactions(db: Database.Database) {
  const catId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }
  const catId2 = db.prepare("SELECT id FROM categories WHERE name = 'Car Insurance'").get() as { id: number }
  const docId = db.prepare("INSERT INTO documents (filename, filepath, status) VALUES ('test.pdf', '/tmp/test.pdf', 'completed')").run().lastInsertRowid

  // Netflix: 3 transactions
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-01-15', 'NETFLIX.COM', 15.99, 'debit', catId.id, docId, 'Netflix')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-02-15', 'NETFLIX.COM', 15.99, 'debit', catId.id, docId, 'Netflix')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-03-15', 'NETFLIX.COM', 15.99, 'debit', catId.id, docId, 'Netflix')

  // Cincinnati Insurance: 2 transactions with different normalized names
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-05-01', 'Cincinnati Ins', 2668.00, 'debit', catId2.id, docId, 'Cincinnati Insurance')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-10-30', 'The Cincinnati Insurance', 2668.00, 'debit', catId2.id, docId, 'The Cincinnati Insurance')

  // No normalized merchant
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-01-20', 'UNKNOWN', 50.00, 'debit', catId.id, docId, null)
}

describe('getAllMerchants', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    seedTransactions(db)
  })

  it('returns all distinct merchants with stats', () => {
    const merchants = getAllMerchants(db)
    expect(merchants).toHaveLength(3)
    const netflix = merchants.find(m => m.merchant === 'Netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.transactionCount).toBe(3)
    expect(netflix!.totalAmount).toBeCloseTo(47.97)
    expect(netflix!.firstDate).toBe('2025-01-15')
    expect(netflix!.lastDate).toBe('2025-03-15')
  })

  it('excludes null normalized_merchant', () => {
    const merchants = getAllMerchants(db)
    expect(merchants.every(m => m.merchant !== null)).toBe(true)
  })

  it('filters by search query', () => {
    const merchants = getAllMerchants(db, 'cincinnati')
    expect(merchants).toHaveLength(2)
    expect(merchants.every(m => m.merchant.toLowerCase().includes('cincinnati'))).toBe(true)
  })

  it('sorts by transaction count descending', () => {
    const merchants = getAllMerchants(db)
    expect(merchants[0].merchant).toBe('Netflix')
    expect(merchants[0].transactionCount).toBe(3)
  })

  it('includes category name', () => {
    const merchants = getAllMerchants(db)
    const netflix = merchants.find(m => m.merchant === 'Netflix')
    expect(netflix!.categoryName).toBe('Groceries')
  })
})
