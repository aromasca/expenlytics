import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import {
  getCommitments, mergeMerchants,
  setCommitmentStatus, getCommitmentStatuses, getExcludedMerchants
} from '@/lib/db/commitments'

describe('getCommitments', () => {
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

    const groups = getCommitments(db, {})
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

    const groups = getCommitments(db, { start_date: '2025-01-01', end_date: '2025-03-31' })
    expect(groups.length).toBe(1)
    expect(groups[0].occurrences).toBe(3)
  })

  it('excludes credit transactions', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
      { date: '2025-02-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'XYZ Corp'").run()

    const groups = getCommitments(db, {})
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

    const groups = getCommitments(db, {})
    expect(groups).toHaveLength(0)
  })

  it('excludes transactions without normalized_merchant', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Unknown', amount: 50.00, type: 'debit' },
      { date: '2025-02-15', description: 'Unknown', amount: 50.00, type: 'debit' },
    ])
    // Don't set normalized_merchant — should be skipped

    const groups = getCommitments(db, {})
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

  it('cleans up commitment status entries for merged-away merchants', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
      { date: '2025-02-15', description: 'B', amount: 10, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant A' WHERE description = 'A'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Merchant B' WHERE description = 'B'").run()

    setCommitmentStatus(db, 'Merchant B', 'not_recurring')
    expect(getCommitmentStatuses(db).has('Merchant B')).toBe(true)

    mergeMerchants(db, ['Merchant A', 'Merchant B'], 'Merchant A')

    expect(getCommitmentStatuses(db).has('Merchant B')).toBe(false)
  })
})

describe('commitment_status', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('sets and retrieves commitment status', () => {
    setCommitmentStatus(db, 'Netflix', 'ended')
    const statuses = getCommitmentStatuses(db)
    expect(statuses.get('Netflix')).toMatchObject({ status: 'ended' })
  })

  it('upserts status on repeat calls', () => {
    setCommitmentStatus(db, 'Netflix', 'ended')
    setCommitmentStatus(db, 'Netflix', 'not_recurring', 'Not a commitment')
    const statuses = getCommitmentStatuses(db)
    expect(statuses.get('Netflix')?.status).toBe('not_recurring')
    expect(statuses.get('Netflix')?.notes).toBe('Not a commitment')
  })

  it('removes status when set to active', () => {
    setCommitmentStatus(db, 'Netflix', 'ended')
    setCommitmentStatus(db, 'Netflix', 'active')
    const statuses = getCommitmentStatuses(db)
    expect(statuses.has('Netflix')).toBe(false)
  })

  it('getExcludedMerchants returns not_recurring merchants', () => {
    setCommitmentStatus(db, 'Chipotle', 'not_recurring')
    setCommitmentStatus(db, 'Netflix', 'ended')
    const excluded = getExcludedMerchants(db)
    expect(excluded.has('Chipotle')).toBe(true)
    expect(excluded.has('Netflix')).toBe(false)
  })

  it('migrates dismissed_subscriptions to commitment_status', () => {
    // Insert into old table directly
    db.prepare("INSERT INTO dismissed_subscriptions (normalized_merchant) VALUES ('OldMerchant')").run()
    // Re-run schema to trigger migration
    initializeSchema(db)
    const statuses = getCommitmentStatuses(db)
    expect(statuses.get('OldMerchant')?.status).toBe('not_recurring')
  })

  it('migrates subscription_status to commitment_status', () => {
    // Simulate old table existing with data
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscription_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_merchant TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('ended', 'not_recurring')),
        status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
        notes TEXT
      )
    `)
    db.prepare("INSERT INTO subscription_status (normalized_merchant, status, notes) VALUES (?, 'ended', 'cancelled')").run('OldService')
    // Re-run schema to trigger migration
    initializeSchema(db)
    const statuses = getCommitmentStatuses(db)
    expect(statuses.get('OldService')?.status).toBe('ended')
    expect(statuses.get('OldService')?.notes).toBe('cancelled')
  })

  it('migrates excluded_recurring_transactions to excluded_commitment_transactions', () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Test', amount: 10, type: 'debit' },
    ])
    const txn = db.prepare('SELECT id FROM transactions LIMIT 1').get() as { id: number }
    // Simulate old table existing with data
    db.exec(`
      CREATE TABLE IF NOT EXISTS excluded_recurring_transactions (
        transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE
      )
    `)
    db.prepare('INSERT INTO excluded_recurring_transactions (transaction_id) VALUES (?)').run(txn.id)
    // Re-run schema to trigger migration
    initializeSchema(db)
    const row = db.prepare('SELECT transaction_id FROM excluded_commitment_transactions WHERE transaction_id = ?').get([txn.id])
    expect(row).toBeTruthy()
  })
})
