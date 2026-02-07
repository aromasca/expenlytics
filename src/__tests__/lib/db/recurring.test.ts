import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import { getRecurringCharges } from '@/lib/db/recurring'

describe('getRecurringCharges', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')
  })

  it('detects recurring charges by normalized_merchant', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'NETFLIX.COM 1234', amount: 15.99, type: 'debit' },
      { date: '2025-02-15', description: 'NETFLIX.COM 5678', amount: 15.99, type: 'debit' },
      { date: '2025-03-15', description: 'NETFLIX.COM 9012', amount: 15.99, type: 'debit' },
      { date: '2025-01-20', description: 'Whole Foods', amount: 120.00, type: 'debit' },
    ])
    // Simulate LLM normalization
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix' WHERE description LIKE 'NETFLIX%'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Whole Foods Market' WHERE description = 'Whole Foods'").run()

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(1)
    expect(groups[0].merchantName).toBe('Netflix')
    expect(groups[0].occurrences).toBe(3)
  })

  it('filters by date range', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Netflix', amount: 15.99, type: 'debit' },
      { date: '2025-02-15', description: 'Netflix', amount: 15.99, type: 'debit' },
      { date: '2025-06-15', description: 'Netflix', amount: 15.99, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix'").run()

    const groups = getRecurringCharges(db, { start_date: '2025-01-01', end_date: '2025-03-31' })
    expect(groups.length).toBe(1)
    expect(groups[0].occurrences).toBe(2)
  })

  it('excludes credit transactions', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
      { date: '2025-02-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'XYZ Corp'").run()

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(0)
  })

  it('excludes transactions without normalized_merchant', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Unknown', amount: 50.00, type: 'debit' },
      { date: '2025-02-15', description: 'Unknown', amount: 50.00, type: 'debit' },
    ])
    // Don't set normalized_merchant — should be skipped

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(0)
  })
})
