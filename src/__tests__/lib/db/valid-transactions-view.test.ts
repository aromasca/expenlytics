import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import { createFlag } from '@/lib/db/transaction-flags'

describe('valid_transactions view', () => {
  function createDb() {
    const db = new Database(':memory:')
    initializeSchema(db)
    return db
  }

  it('excludes flagged-removed transactions', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Normal Purchase', amount: 100, type: 'debit' },
      { date: '2025-01-16', description: 'Duplicate', amount: 200, type: 'debit' },
    ])
    const txns = db.prepare('SELECT id FROM transactions ORDER BY date').all() as Array<{ id: number }>
    // Flag second as removed duplicate
    const flagId = createFlag(db, txns[1].id, 'duplicate')
    db.prepare("UPDATE transaction_flags SET resolution = 'removed' WHERE id = ?").run(flagId)

    const rows = db.prepare('SELECT description FROM valid_transactions').all() as Array<{ description: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Normal Purchase')
  })

  it('excludes transfer categories (exclude_from_totals)', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    const transferCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }).id
    const groceryCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id

    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Groceries', amount: 50, type: 'debit' },
    ])
    db.prepare('UPDATE transactions SET category_id = ? WHERE description = ?').run(groceryCatId, 'Groceries')

    // Insert a transfer manually
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, category_id)
      VALUES (?, '2025-01-16', 'Wire Transfer', 500, 'debit', ?)`).run(docId, transferCatId)

    const rows = db.prepare('SELECT description FROM valid_transactions').all() as Array<{ description: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Groceries')
  })

  it('excludes refund class but includes payment/transfer class', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Normal', amount: 100, type: 'debit' },
    ])
    // Payment and transfer classes INCLUDED (loan/car payments are real spending)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, transaction_class)
      VALUES (?, '2025-01-16', 'Car Payment', 500, 'debit', 'payment')`).run(docId)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, transaction_class)
      VALUES (?, '2025-01-17', 'Bank Transfer', 1000, 'debit', 'transfer')`).run(docId)
    // Refund class EXCLUDED (inflates income when categorized under normal categories)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, transaction_class)
      VALUES (?, '2025-01-18', 'Return', 75, 'credit', 'refund')`).run(docId)

    const rows = db.prepare('SELECT description FROM valid_transactions ORDER BY date').all() as Array<{ description: string }>
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.description)).toEqual(['Normal', 'Car Payment', 'Bank Transfer'])
  })

  it('includes category columns from join', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    const catId = (db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods', amount: 100, type: 'debit' },
    ])
    db.prepare('UPDATE transactions SET category_id = ? WHERE description = ?').run(catId, 'Whole Foods')

    const row = db.prepare('SELECT category_name, category_color, category_group FROM valid_transactions').get() as Record<string, string>
    expect(row.category_name).toBe('Groceries')
    expect(row.category_color).toBeTruthy()
    expect(row.category_group).toBe('Food & Drink')
  })

  it('includes uncategorized transactions with null category fields', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Unknown Charge', amount: 25, type: 'debit' },
    ])

    const row = db.prepare('SELECT category_name, category_color, category_group FROM valid_transactions').get() as Record<string, string | null>
    expect(row.category_name).toBeNull()
  })
})
