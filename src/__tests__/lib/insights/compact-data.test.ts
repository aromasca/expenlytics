import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { buildCompactData } from '@/lib/insights/compact-data'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }
  return row.id
}

function insertTx(db: Database.Database, opts: {
  date: string; description: string; amount: number;
  type?: string; category?: string; normalized_merchant?: string
}) {
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId, opts.normalized_merchant ?? null)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('buildCompactData', () => {
  it('returns empty structure for no transactions', () => {
    const db = createDb()
    const data = buildCompactData(db)
    expect(data.monthly).toEqual([])
    expect(data.categories).toEqual([])
    expect(data.merchants).toEqual([])
    expect(data.day_of_week).toHaveLength(7)
    expect(data.daily_recent).toEqual([])
    expect(data.recurring).toEqual([])
    expect(data.outliers).toEqual([])
  })

  it('compacts monthly income and spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.monthly.length).toBeGreaterThanOrEqual(1)
    const m = data.monthly.find(r => r.income > 0)
    expect(m).toBeDefined()
    expect(m!.income).toBe(5000)
    expect(m!.spending).toBe(200)
    expect(m!.net).toBe(4800)
  })

  it('includes merchant profiles with frequency data', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(3), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    const data = buildCompactData(db)
    const netflix = data.merchants.find(m => m.name === 'Netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.count).toBe(3)
    expect(netflix!.total).toBe(45)
  })

  it('includes day-of-week distribution', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Test', amount: 100, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.day_of_week).toHaveLength(7)
    const totalTxns = data.day_of_week.reduce((s, d) => s + d.transaction_count, 0)
    expect(totalTxns).toBe(1)
  })

  it('excludes payment/transfer transaction_class from compact data', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    // Insert a payment-class transaction with normal category
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-class-test')
    `).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    const catId = getCategoryId(db, 'Groceries')
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'Payment', 500, 'debit', ?, 'payment')
    `).run(docId, monthsAgo(1), catId)
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'Transfer Out', 1000, 'debit', ?, 'transfer')
    `).run(docId, monthsAgo(1), catId)

    const data = buildCompactData(db)
    const m = data.monthly.find(r => r.spending > 0)
    expect(m).toBeDefined()
    // Only Groceries (200) counts; payment (500) and transfer (1000) excluded
    expect(m!.spending).toBe(200)
  })

  it('includes recent_transactions for last 90 days', () => {
    const db = createDb()
    // Transaction within 90 days — should be included
    insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 85.50, category: 'Groceries', normalized_merchant: 'Whole Foods' })
    // Transaction outside 90 days — should be excluded
    insertTx(db, { date: monthsAgo(4), description: 'Old Purchase', amount: 50, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.recent_transactions).toBeDefined()
    expect(data.recent_transactions).toHaveLength(1)
    expect(data.recent_transactions[0]).toMatchObject({
      date: expect.any(String),
      description: 'Whole Foods',
      amount: 85.50,
      type: 'debit',
      category: 'Groceries',
      normalized_merchant: 'Whole Foods',
    })
  })

  it('excludes transfer/payment classes from recent_transactions', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    // Insert a payment-class transaction
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-recent-txn-test')
    `).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    const catId = getCategoryId(db, 'Groceries')
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'CC Payment', 500, 'debit', ?, 'payment')
    `).run(docId, monthsAgo(1), catId)
    const data = buildCompactData(db)
    expect(data.recent_transactions).toHaveLength(1)
    expect(data.recent_transactions[0].description).toBe('Groceries')
  })

  it('includes merchant_month_deltas for top merchants', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 200, normalized_merchant: 'Whole Foods', category: 'Groceries' })
    insertTx(db, { date: monthsAgo(2), description: 'Whole Foods', amount: 150, normalized_merchant: 'Whole Foods', category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.merchant_month_deltas).toBeDefined()
    expect(data.merchant_month_deltas.length).toBeGreaterThanOrEqual(2)
    const wf = data.merchant_month_deltas.find(m => m.merchant === 'Whole Foods')
    expect(wf).toBeDefined()
    expect(Object.keys(wf!.months).length).toBeGreaterThanOrEqual(2)
  })

  it('excludes transfer/savings/investments from all compact data sections', () => {
    const db = createDb()
    // Real spending
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    // Inter-account transfers (should be excluded)
    insertTx(db, { date: monthsAgo(1), description: 'CC Payment', amount: 500, category: 'Transfer' })
    insertTx(db, { date: monthsAgo(1), description: 'Savings Transfer', amount: 1000, category: 'Savings' })
    insertTx(db, { date: monthsAgo(1), description: '401k Contribution', amount: 800, category: 'Investments' })
    insertTx(db, { date: monthsAgo(1), description: 'Refund', amount: 50, type: 'credit', category: 'Refund' })

    const data = buildCompactData(db)

    // Monthly: only real income (5000) and spending (200)
    const m = data.monthly.find(r => r.income > 0)
    expect(m).toBeDefined()
    expect(m!.income).toBe(5000)
    expect(m!.spending).toBe(200)

    // Categories: should not include Transfer/Savings/Investments
    const catNames = data.categories.map(c => c.category)
    expect(catNames).not.toContain('Transfer')
    expect(catNames).not.toContain('Savings')
    expect(catNames).not.toContain('Investments')

    // Day-of-week: only 1 real debit transaction
    const totalTxns = data.day_of_week.reduce((s, d) => s + d.transaction_count, 0)
    expect(totalTxns).toBe(1)
  })
})
