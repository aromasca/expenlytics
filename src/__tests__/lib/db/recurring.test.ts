import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import {
  getRecurringCharges, mergeMerchants,
  setSubscriptionStatus, getSubscriptionStatuses, getExcludedMerchants
} from '@/lib/db/recurring'

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
      { date: '2025-03-15', description: 'Netflix', amount: 15.99, type: 'debit' },
      { date: '2025-06-15', description: 'Netflix', amount: 15.99, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix'").run()

    const groups = getRecurringCharges(db, { start_date: '2025-01-01', end_date: '2025-03-31' })
    expect(groups.length).toBe(1)
    expect(groups[0].occurrences).toBe(3)
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

  it('excludes transactions in transfer categories from recurring detection', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
      { date: '2025-02-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
      { date: '2025-03-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Savings Transfer'").run()
    const transferCat = db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }
    db.prepare('UPDATE transactions SET category_id = ?').run(transferCat.id)

    const groups = getRecurringCharges(db, {})
    expect(groups).toHaveLength(0)
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

  it('cleans up subscription status entries for merged-away merchants', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
      { date: '2025-02-15', description: 'B', amount: 10, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant A' WHERE description = 'A'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant B' WHERE description = 'B'").run()

    setSubscriptionStatus(db, 'Merchant B', 'not_recurring')
    expect(getSubscriptionStatuses(db).has('Merchant B')).toBe(true)

    mergeMerchants(db, ['Merchant A', 'Merchant B'], 'Merchant A')

    expect(getSubscriptionStatuses(db).has('Merchant B')).toBe(false)
  })
})

describe('subscription_status', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('sets and retrieves subscription status', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('Netflix')).toMatchObject({ status: 'ended' })
  })

  it('upserts status on repeat calls', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    setSubscriptionStatus(db, 'Netflix', 'not_recurring', 'Not a subscription')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('Netflix')?.status).toBe('not_recurring')
    expect(statuses.get('Netflix')?.notes).toBe('Not a subscription')
  })

  it('removes status when set to active', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    setSubscriptionStatus(db, 'Netflix', 'active')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.has('Netflix')).toBe(false)
  })

  it('getExcludedMerchants returns not_recurring merchants', () => {
    setSubscriptionStatus(db, 'Chipotle', 'not_recurring')
    setSubscriptionStatus(db, 'Netflix', 'ended')
    const excluded = getExcludedMerchants(db)
    expect(excluded.has('Chipotle')).toBe(true)
    expect(excluded.has('Netflix')).toBe(false)
  })

  it('migrates dismissed_subscriptions to subscription_status', () => {
    // Insert into old table directly
    db.prepare("INSERT INTO dismissed_subscriptions (normalized_merchant) VALUES ('OldMerchant')").run()
    // Re-run schema to trigger migration
    initializeSchema(db)
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('OldMerchant')?.status).toBe('not_recurring')
  })
})
