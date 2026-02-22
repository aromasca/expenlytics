import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getAllMerchants, getMerchantDescriptionGroups, getMerchantTransactions, splitMerchant } from '@/lib/db/merchants'

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

function seedSplitTransactions(db: Database.Database) {
  const catId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }
  const docId = db.prepare("INSERT INTO documents (filename, filepath, status) VALUES ('test.pdf', '/tmp/test.pdf', 'completed')").run().lastInsertRowid

  // Acme Corp with two different descriptions
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-01-10', 'ACME CORP ONLINE', 100, 'debit', catId.id, docId, 'Acme Corp')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-02-10', 'ACME CORP ONLINE', 200, 'debit', catId.id, docId, 'Acme Corp')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-03-10', 'ACME CORP STORE', 50, 'debit', catId.id, docId, 'Acme Corp')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-04-10', 'ACME CORP STORE', 75, 'debit', catId.id, docId, 'Acme Corp')
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-05-10', 'ACME CORP STORE', 60, 'debit', catId.id, docId, 'Acme Corp')

  // Different merchant
  db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-01-15', 'GLOBEX INC', 500, 'debit', catId.id, docId, 'Globex')
}

describe('getMerchantDescriptionGroups', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    seedSplitTransactions(db)
  })

  it('returns description groups for a merchant', () => {
    const groups = getMerchantDescriptionGroups(db, 'Acme Corp')
    expect(groups).toHaveLength(2)
    // Ordered by count DESC — STORE has 3, ONLINE has 2
    expect(groups[0].description).toBe('ACME CORP STORE')
    expect(groups[0].transactionCount).toBe(3)
    expect(groups[0].totalAmount).toBeCloseTo(185)
    expect(groups[0].firstDate).toBe('2025-03-10')
    expect(groups[0].lastDate).toBe('2025-05-10')

    expect(groups[1].description).toBe('ACME CORP ONLINE')
    expect(groups[1].transactionCount).toBe(2)
    expect(groups[1].totalAmount).toBeCloseTo(300)
  })

  it('returns empty array for unknown merchant', () => {
    const groups = getMerchantDescriptionGroups(db, 'Unknown Corp')
    expect(groups).toEqual([])
  })
})

describe('getMerchantTransactions', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    seedSplitTransactions(db)
  })

  it('returns all transactions for a merchant', () => {
    const txns = getMerchantTransactions(db, 'Acme Corp')
    expect(txns).toHaveLength(5)
    // Ordered by date DESC
    expect(txns[0].date).toBe('2025-05-10')
    expect(txns[4].date).toBe('2025-01-10')
    expect(txns[0].description).toBe('ACME CORP STORE')
    expect(txns[0].amount).toBe(60)
  })

  it('filters by description when provided', () => {
    const txns = getMerchantTransactions(db, 'Acme Corp', 'ACME CORP ONLINE')
    expect(txns).toHaveLength(2)
    expect(txns.every(t => t.description === 'ACME CORP ONLINE')).toBe(true)
  })

  it('returns empty array for unknown merchant', () => {
    const txns = getMerchantTransactions(db, 'Unknown Corp')
    expect(txns).toEqual([])
  })
})

describe('splitMerchant', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    seedSplitTransactions(db)
  })

  it('updates normalized_merchant on selected transactions', () => {
    // Get the STORE transaction IDs
    const storeTxns = getMerchantTransactions(db, 'Acme Corp', 'ACME CORP STORE')
    const storeIds = storeTxns.map(t => t.id)
    expect(storeIds).toHaveLength(3)

    const changes = splitMerchant(db, storeIds, 'Acme Store')
    expect(changes).toBe(3)

    // Verify split: original merchant now has only ONLINE transactions
    const remaining = getMerchantTransactions(db, 'Acme Corp')
    expect(remaining).toHaveLength(2)
    expect(remaining.every(t => t.description === 'ACME CORP ONLINE')).toBe(true)

    // New merchant has STORE transactions
    const newMerchant = getMerchantTransactions(db, 'Acme Store')
    expect(newMerchant).toHaveLength(3)
    expect(newMerchant.every(t => t.description === 'ACME CORP STORE')).toBe(true)
  })

  it('returns 0 for empty transaction IDs', () => {
    const changes = splitMerchant(db, [], 'Acme Store')
    expect(changes).toBe(0)
  })
})
