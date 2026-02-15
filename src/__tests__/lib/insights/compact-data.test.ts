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
})
