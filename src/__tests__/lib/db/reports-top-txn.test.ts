import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getTopTransactions } from '@/lib/db/reports'

describe('getTopTransactions', () => {
  it('excludes transfers and refunds', () => {
    const db = new Database(':memory:')
    initializeSchema(db)

    // Get category IDs
    const transfer = db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }
    const groceries = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }

    // Insert a document
    db.prepare("INSERT INTO documents (filename, filepath, status) VALUES ('test.pdf', '/tmp/test.pdf', 'completed')").run()

    // Insert a large transfer (should be excluded - category has exclude_from_totals=1)
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-15', 'Wire Transfer', 50000, 'debit', ?, 1, 'transfer')").run(transfer.id)

    // Insert a large refund (should be excluded - transaction_class='refund')
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-16', 'Refund', 2000, 'credit', ?, 1, 'refund')").run(groceries.id)

    // Insert a real purchase (should be included)
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-17', 'Grocery Store', 150, 'debit', ?, 1, 'purchase')").run(groceries.id)

    const results = getTopTransactions(db, {}, 50)
    expect(results).toHaveLength(1)
    expect(results[0].description).toBe('Grocery Store')
  })
})
