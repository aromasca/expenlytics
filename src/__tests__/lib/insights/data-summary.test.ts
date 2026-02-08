import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { buildDataSummary } from '@/lib/insights/data-summary'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  return (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function insertTxn(db: Database.Database, date: string, desc: string, amount: number, category: string) {
  db.prepare(`INSERT INTO documents (filename, filepath, status, file_hash) VALUES ('t.pdf', '/t.pdf', 'completed', 'h-' || abs(random()))`).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const catId = getCategoryId(db, category)
  db.prepare('INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)').run(docId, date, desc, amount, 'debit', catId)
}

describe('buildDataSummary', () => {
  it('returns empty summary for no data', () => {
    const db = createDb()
    const summary = buildDataSummary(db)
    expect(summary.monthly_by_category).toEqual([])
    expect(summary.top_merchants).toEqual([])
    expect(summary.category_changes).toEqual([])
    expect(summary.outliers).toEqual([])
    expect(summary.metadata.transaction_count).toBe(0)
  })

  it('builds summary with transaction data', () => {
    const db = createDb()
    insertTxn(db, monthsAgo(0), 'Whole Foods', 150, 'Groceries')
    insertTxn(db, monthsAgo(0), 'Trader Joes', 80, 'Groceries')
    insertTxn(db, monthsAgo(1), 'Whole Foods', 100, 'Groceries')
    insertTxn(db, monthsAgo(0), 'Netflix', 15, 'Subscriptions')
    insertTxn(db, monthsAgo(1), 'Netflix', 15, 'Subscriptions')

    const summary = buildDataSummary(db)
    expect(summary.metadata.transaction_count).toBe(5)
    expect(summary.monthly_by_category.length).toBeGreaterThan(0)
    expect(summary.top_merchants.length).toBeGreaterThan(0)
    expect(summary.top_merchants.find(m => m.merchant === 'Whole Foods')).toBeDefined()
  })

  it('detects category changes between months', () => {
    const db = createDb()
    // Previous month: low groceries
    insertTxn(db, monthsAgo(1), 'Store A', 50, 'Groceries')
    // Current month: high groceries
    insertTxn(db, monthsAgo(0), 'Store B', 200, 'Groceries')

    const summary = buildDataSummary(db)
    const groceryChange = summary.category_changes.find(c => c.category === 'Groceries')
    expect(groceryChange).toBeDefined()
    expect(groceryChange!.change_pct).toBeGreaterThan(0)
  })
})
