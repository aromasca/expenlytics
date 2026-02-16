import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createAccount, findAccountByInstitutionAndLastFour, assignDocumentToAccount, listAccountsWithCompleteness } from '@/lib/db/accounts'
import { createDocument } from '@/lib/db/documents'

describe('account detection integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('matches document to existing account by institution and last_four', () => {
    const accId = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
    const docId = createDocument(db, 'statement.pdf', '/tmp/statement.pdf', 'hash1')

    // Simulate what pipeline does after extraction
    const found = findAccountByInstitutionAndLastFour(db, 'Chase', '4821')
    expect(found).toBeDefined()
    assignDocumentToAccount(db, docId, found!.id, '2025-01')

    const link = db.prepare('SELECT account_id FROM document_accounts WHERE document_id = ?').get(docId) as { account_id: number }
    expect(link.account_id).toBe(accId)
  })

  it('creates new account when no match found', () => {
    const docId = createDocument(db, 'new.pdf', '/tmp/new.pdf', 'hash2')
    const found = findAccountByInstitutionAndLastFour(db, 'Amex', '1234')
    expect(found).toBeUndefined()

    const accId = createAccount(db, { name: 'Amex Gold', institution: 'Amex', lastFour: '1234', type: 'credit_card' })
    assignDocumentToAccount(db, docId, accId, '2025-01')

    const accounts = listAccountsWithCompleteness(db)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Amex Gold')
  })

  it('completeness grid shows missing months correctly', () => {
    const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })

    // Create two documents for Jan and Mar (Feb missing)
    const doc1 = createDocument(db, 'jan.pdf', '/tmp/jan.pdf', 'h1')
    const doc2 = createDocument(db, 'mar.pdf', '/tmp/mar.pdf', 'h2')
    assignDocumentToAccount(db, doc1, accId, '2025-01')
    assignDocumentToAccount(db, doc2, accId, '2025-03')
    db.prepare('UPDATE documents SET status = ? WHERE id IN (?, ?)').run('completed', doc1, doc2)

    const accounts = listAccountsWithCompleteness(db)
    expect(accounts[0].months['2025-01'].status).toBe('complete')
    expect(accounts[0].months['2025-02'].status).toBe('missing')
    expect(accounts[0].months['2025-03'].status).toBe('complete')
  })

  it('handles combined multi-account statements', () => {
    const checking = createAccount(db, { name: 'Checking', institution: 'FT', lastFour: '1256', type: 'checking_account' })
    const savings = createAccount(db, { name: 'Savings', institution: 'FT', lastFour: '1223', type: 'savings_account' })

    // Single document covers both accounts
    const docId = createDocument(db, 'combined.pdf', '/tmp/combined.pdf', 'h1')
    assignDocumentToAccount(db, docId, checking, '2025-07')
    assignDocumentToAccount(db, docId, savings, '2025-07')
    db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('completed', docId)

    const accounts = listAccountsWithCompleteness(db)
    expect(accounts).toHaveLength(2)
    expect(accounts.every(a => a.months['2025-07'].status === 'complete')).toBe(true)
    // Same document filename appears for both accounts
    expect(accounts.every(a => a.months['2025-07'].documents[0].filename === 'combined.pdf')).toBe(true)
  })
})
