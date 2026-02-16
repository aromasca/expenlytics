import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import {
  createAccount,
  findAccountByInstitutionAndLastFour,
  getAccount,
  listAccountsWithCompleteness,
  renameAccount,
  mergeAccounts,
  getUnassignedDocuments,
  assignDocumentToAccount,
  resetAccountDetection,
} from '@/lib/db/accounts'
import { createDocument } from '@/lib/db/documents'

describe('accounts', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  describe('createAccount', () => {
    it('creates an account and returns its id', () => {
      const id = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      expect(id).toBe(1)
      const account = getAccount(db, id)
      expect(account).toMatchObject({ name: 'Chase Sapphire', institution: 'Chase', last_four: '4821', type: 'credit_card' })
    })
  })

  describe('findAccountByInstitutionAndLastFour', () => {
    it('finds existing account by institution and last four', () => {
      const id = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const found = findAccountByInstitutionAndLastFour(db, 'Chase', '4821')
      expect(found?.id).toBe(id)
    })

    it('returns undefined when no match', () => {
      const found = findAccountByInstitutionAndLastFour(db, 'Chase', '9999')
      expect(found).toBeUndefined()
    })
  })

  describe('renameAccount', () => {
    it('updates account name', () => {
      const id = createAccount(db, { name: 'Old Name', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      renameAccount(db, id, 'New Name')
      expect(getAccount(db, id)?.name).toBe('New Name')
    })
  })

  describe('mergeAccounts', () => {
    it('reassigns documents from source to target and deletes source', () => {
      const target = createAccount(db, { name: 'Target', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const source = createAccount(db, { name: 'Source', institution: 'Chase', lastFour: '4822', type: 'credit_card' })

      const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf', 'hash1')
      assignDocumentToAccount(db, docId, source, '2025-01')

      mergeAccounts(db, source, target)

      // Junction table reassigned to target
      const link = db.prepare('SELECT account_id FROM document_accounts WHERE document_id = ?').get(docId) as { account_id: number }
      expect(link.account_id).toBe(target)

      // Source account deleted
      expect(getAccount(db, source)).toBeUndefined()
    })
  })

  describe('assignDocumentToAccount', () => {
    it('supports multiple accounts per document', () => {
      const checking = createAccount(db, { name: 'Checking', institution: 'First Tech', lastFour: '1256', type: 'checking_account' })
      const savings = createAccount(db, { name: 'Savings', institution: 'First Tech', lastFour: '1223', type: 'savings_account' })

      const docId = createDocument(db, 'combined.pdf', '/tmp/combined.pdf', 'hash1')
      assignDocumentToAccount(db, docId, checking, '2025-07', 'Statement Date: 07/31/2025')
      assignDocumentToAccount(db, docId, savings, '2025-07', 'Statement Date: 07/31/2025')

      const links = db.prepare('SELECT account_id FROM document_accounts WHERE document_id = ? ORDER BY account_id').all(docId) as Array<{ account_id: number }>
      expect(links).toHaveLength(2)
      expect(links.map(l => l.account_id)).toEqual([checking, savings])
    })
  })

  describe('listAccountsWithCompleteness', () => {
    it('returns accounts with month coverage from statement_month', () => {
      const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })

      // Create two documents: Jan and Mar statements (Feb missing)
      const doc1 = createDocument(db, 'jan.pdf', '/tmp/jan.pdf', 'hash1')
      const doc2 = createDocument(db, 'mar.pdf', '/tmp/mar.pdf', 'hash2')
      assignDocumentToAccount(db, doc1, accId, '2025-01')
      assignDocumentToAccount(db, doc2, accId, '2025-03')
      db.prepare('UPDATE documents SET status = ? WHERE id IN (?, ?)').run('completed', doc1, doc2)

      const accounts = listAccountsWithCompleteness(db)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('Chase')
      expect(accounts[0].documentCount).toBe(2)
      expect(accounts[0].months['2025-01']).toEqual({ status: 'complete', documents: [{ filename: 'jan.pdf', statementDate: null }] })
      expect(accounts[0].months['2025-02']).toEqual({ status: 'missing', documents: [] })
      expect(accounts[0].months['2025-03']).toEqual({ status: 'complete', documents: [{ filename: 'mar.pdf', statementDate: null }] })
    })

    it('shows same document for multiple accounts (combined statement)', () => {
      const checking = createAccount(db, { name: 'Checking', institution: 'FT', lastFour: '1256', type: 'checking_account' })
      const savings = createAccount(db, { name: 'Savings', institution: 'FT', lastFour: '1223', type: 'savings_account' })

      const docId = createDocument(db, 'combined.pdf', '/tmp/combined.pdf', 'hash1')
      assignDocumentToAccount(db, docId, checking, '2025-07', '07/01 through 07/31')
      assignDocumentToAccount(db, docId, savings, '2025-07', '07/01 through 07/31')
      db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('completed', docId)

      const accounts = listAccountsWithCompleteness(db)
      expect(accounts).toHaveLength(2)

      const checkingAcc = accounts.find(a => a.name === 'Checking')!
      const savingsAcc = accounts.find(a => a.name === 'Savings')!
      expect(checkingAcc.months['2025-07'].status).toBe('complete')
      expect(savingsAcc.months['2025-07'].status).toBe('complete')
    })
  })

  describe('getUnassignedDocuments', () => {
    it('returns documents with no account links', () => {
      createDocument(db, 'unassigned.pdf', '/tmp/unassigned.pdf', 'hash1')
      const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const assignedDocId = createDocument(db, 'assigned.pdf', '/tmp/assigned.pdf', 'hash2')
      assignDocumentToAccount(db, assignedDocId, accId, '2025-01')

      const unassigned = getUnassignedDocuments(db)
      expect(unassigned).toHaveLength(1)
      expect(unassigned[0].filename).toBe('unassigned.pdf')
    })
  })

  describe('resetAccountDetection', () => {
    it('clears all account links and accounts', () => {
      const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf', 'hash1')
      assignDocumentToAccount(db, docId, accId, '2025-01')

      resetAccountDetection(db)

      expect(getAccount(db, accId)).toBeUndefined()
      const links = db.prepare('SELECT * FROM document_accounts').all()
      expect(links).toHaveLength(0)
      const unassigned = getUnassignedDocuments(db)
      expect(unassigned).toHaveLength(1)
    })
  })
})
