import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import { getRecurringCharges, mergeMerchants, dismissMerchant, getDismissedMerchants } from '@/lib/db/recurring'

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

describe('mergeMerchants', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')
  })

  it('updates normalized_merchant for all merged merchants', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'NETFLIX.COM', amount: 15.99, type: 'debit' },
      { date: '2025-02-15', description: 'Netflix Inc', amount: 15.99, type: 'debit' },
      { date: '2025-03-15', description: 'Spotify', amount: 9.99, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix' WHERE description = 'NETFLIX.COM'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix Inc' WHERE description = 'Netflix Inc'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Spotify' WHERE description = 'Spotify'").run()

    const updated = mergeMerchants(db, ['Netflix', 'Netflix Inc'], 'Netflix')
    expect(updated).toBe(2)

    const rows = db.prepare("SELECT normalized_merchant FROM transactions WHERE normalized_merchant = 'Netflix'").all() as Array<{ normalized_merchant: string }>
    expect(rows.length).toBe(2)

    // Spotify unchanged
    const spotify = db.prepare("SELECT normalized_merchant FROM transactions WHERE normalized_merchant = 'Spotify'").all()
    expect(spotify.length).toBe(1)
  })

  it('cleans up dismissed entries for merged-away merchants', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
      { date: '2025-02-15', description: 'B', amount: 10, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant A' WHERE description = 'A'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant B' WHERE description = 'B'").run()

    dismissMerchant(db, 'Merchant B')
    expect(getDismissedMerchants(db).has('Merchant B')).toBe(true)

    mergeMerchants(db, ['Merchant A', 'Merchant B'], 'Merchant A')

    expect(getDismissedMerchants(db).has('Merchant B')).toBe(false)
  })
})
