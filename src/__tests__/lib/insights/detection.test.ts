import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { detectCategoryTrends, detectLifestyleInflation, detectRecurringGrowth, detectSpendingShifts } from '@/lib/insights/detection'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }
  return row.id
}

function insertTransaction(db: Database.Database, opts: {
  date: string
  description: string
  amount: number
  type?: string
  category?: string
  normalized_merchant?: string
}) {
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId, opts.normalized_merchant ?? null)
}

// Helper to get date strings relative to now
function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('detectCategoryTrends', () => {
  it('returns empty for no data', () => {
    const db = createDb()
    expect(detectCategoryTrends(db)).toEqual([])
  })

  it('returns empty when only one period', () => {
    const db = createDb()
    insertTransaction(db, { date: monthsAgo(0), description: 'Grocery', amount: 200, category: 'Groceries' })
    expect(detectCategoryTrends(db)).toEqual([])
  })

  it('detects significant category increase', () => {
    const db = createDb()
    // Previous month: low spending
    insertTransaction(db, { date: monthsAgo(1), description: 'Grocery 1', amount: 100, category: 'Groceries' })
    // Current month: high spending (>15% increase and >$50)
    insertTransaction(db, { date: monthsAgo(0), description: 'Grocery 2', amount: 200, category: 'Groceries' })

    const results = detectCategoryTrends(db)
    expect(results.length).toBeGreaterThanOrEqual(1)
    const groceryInsight = results.find(r => r.id.includes('groceries'))
    expect(groceryInsight).toBeDefined()
    expect(groceryInsight!.severity).toBe('concerning')
    expect(groceryInsight!.percentChange).toBeGreaterThan(15)
  })

  it('ignores small changes below threshold', () => {
    const db = createDb()
    insertTransaction(db, { date: monthsAgo(1), description: 'Grocery 1', amount: 100, category: 'Groceries' })
    insertTransaction(db, { date: monthsAgo(0), description: 'Grocery 2', amount: 110, category: 'Groceries' })
    // 10% increase, < $50 change — should be filtered
    const results = detectCategoryTrends(db)
    const groceryInsight = results.find(r => r.id.includes('groceries'))
    expect(groceryInsight).toBeUndefined()
  })
})

describe('detectLifestyleInflation', () => {
  it('returns empty for insufficient data', () => {
    const db = createDb()
    insertTransaction(db, { date: monthsAgo(0), description: 'test', amount: 100 })
    expect(detectLifestyleInflation(db)).toEqual([])
  })

  it('detects inflation when spending grows over 6+ months', () => {
    const db = createDb()
    // Create gradually increasing spending over 7 months
    for (let i = 6; i >= 0; i--) {
      const amount = 1000 + (6 - i) * 200 // 1000, 1200, 1400, ...
      insertTransaction(db, { date: monthsAgo(i), description: `Month ${i}`, amount })
    }

    const results = detectLifestyleInflation(db)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].type).toBe('lifestyle_inflation')
    expect(results[0].severity).toBe('concerning')
  })
})

describe('detectRecurringGrowth', () => {
  it('returns empty for no recurring charges', () => {
    const db = createDb()
    expect(detectRecurringGrowth(db)).toEqual([])
  })

  it('detects new recurring merchants', () => {
    const db = createDb()
    // Previous month: 2 merchants
    insertTransaction(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix' })
    insertTransaction(db, { date: monthsAgo(1), description: 'Spotify', amount: 10, normalized_merchant: 'Spotify' })
    // Current month: 4 merchants (2 new)
    insertTransaction(db, { date: monthsAgo(0), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix' })
    insertTransaction(db, { date: monthsAgo(0), description: 'Spotify', amount: 10, normalized_merchant: 'Spotify' })
    insertTransaction(db, { date: monthsAgo(0), description: 'Adobe', amount: 55, normalized_merchant: 'Adobe' })
    insertTransaction(db, { date: monthsAgo(0), description: 'Hulu', amount: 18, normalized_merchant: 'Hulu' })

    const results = detectRecurringGrowth(db)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].headline).toContain('new recurring')
  })
})

describe('detectSpendingShifts', () => {
  it('returns empty for no data', () => {
    const db = createDb()
    expect(detectSpendingShifts(db)).toEqual([])
  })

  it('detects shift between categories', () => {
    const db = createDb()
    // Previous month: mostly groceries
    insertTransaction(db, { date: monthsAgo(1), description: 'Grocery', amount: 500, category: 'Groceries' })
    insertTransaction(db, { date: monthsAgo(1), description: 'Dining', amount: 100, category: 'Restaurants' })
    // Current month: shift to dining
    insertTransaction(db, { date: monthsAgo(0), description: 'Grocery', amount: 200, category: 'Groceries' })
    insertTransaction(db, { date: monthsAgo(0), description: 'Dining', amount: 500, category: 'Restaurants' })

    const results = detectSpendingShifts(db)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].type).toBe('spending_shift')
  })
})
