import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'

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
  type?: string; category?: string
}) {
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('getMonthlyIncomeVsSpending', () => {
  it('returns empty for no data', () => {
    const db = createDb()
    expect(getMonthlyIncomeVsSpending(db)).toEqual([])
  })

  it('computes monthly income and spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Rent', amount: 1500, category: 'Rent & Mortgage' })
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 300, category: 'Groceries' })
    const result = getMonthlyIncomeVsSpending(db)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const month = result.find(r => r.income > 0)
    expect(month).toBeDefined()
    expect(month!.income).toBe(5000)
    expect(month!.spending).toBe(1800)
  })

  it('excludes Transfer and Refund from income', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Transfer In', amount: 1000, type: 'credit', category: 'Transfer' })
    insertTx(db, { date: monthsAgo(1), description: 'Refund', amount: 50, type: 'credit', category: 'Refund' })
    const result = getMonthlyIncomeVsSpending(db)
    const month = result.find(r => r.income > 0)
    expect(month!.income).toBe(5000)
  })

  it('excludes payment/transfer class from spending via belt-and-suspenders', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Rent', amount: 1500, category: 'Rent & Mortgage' })
    // Insert a transaction with transaction_class='transfer' but normal category
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-class-test')
    `).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'Misclassified Transfer', 500, 'debit', ?, 'transfer')
    `).run(docId, monthsAgo(1), getCategoryId(db, 'Groceries'))
    const result = getMonthlyIncomeVsSpending(db)
    const month = result.find(r => r.spending > 0)
    expect(month).toBeDefined()
    // Only Rent (1500) counts; transfer-class (500) excluded
    expect(month!.spending).toBe(1500)
  })

  it('excludes Transfer/Savings/Investments debits from spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Rent', amount: 1500, category: 'Rent & Mortgage' })
    insertTx(db, { date: monthsAgo(1), description: 'CC Payment', amount: 500, category: 'Transfer' })
    insertTx(db, { date: monthsAgo(1), description: 'Savings', amount: 1000, category: 'Savings' })
    insertTx(db, { date: monthsAgo(1), description: '401k', amount: 800, category: 'Investments' })
    const result = getMonthlyIncomeVsSpending(db)
    const month = result.find(r => r.spending > 0)
    expect(month).toBeDefined()
    // Only Rent (1500) counts; Transfer (500), Savings (1000), Investments (800) excluded
    expect(month!.spending).toBe(1500)
  })
})
