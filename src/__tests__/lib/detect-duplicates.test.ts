import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { detectDuplicates, detectCategoryMismatches } from '@/lib/detect-duplicates'
import { getUnresolvedFlags } from '@/lib/db/transaction-flags'

let db: Database.Database

function insertDoc(db: Database.Database, filename = 'test.pdf') {
  return Number(
    db
      .prepare("INSERT INTO documents (filename, filepath) VALUES (?, '/tmp/test.pdf')")
      .run(filename).lastInsertRowid
  )
}

function insertTxn(
  db: Database.Database,
  docId: number,
  date: string,
  description: string,
  amount: number,
  type: string,
  categoryName?: string,
  manualCategory = 0
) {
  let categoryId = null
  if (categoryName) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName) as
      | { id: number }
      | undefined
    categoryId = cat?.id ?? null
  }
  return Number(
    db
      .prepare(
        'INSERT INTO transactions (document_id, date, description, amount, type, category_id, manual_category) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(docId, date, description, amount, type, categoryId, manualCategory).lastInsertRowid
  )
}

beforeEach(() => {
  db = new Database(':memory:')
  initializeSchema(db)
})

describe('detectDuplicates', () => {
  it('detects cross-document duplicates with same date+amount+type', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')

    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 50.0, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store Purchase', 50.0, 'debit')

    const count = detectDuplicates(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db, 'duplicate')
    expect(flags).toHaveLength(1)
    expect(flags[0].document_id).toBe(doc2) // later doc flagged
    expect(flags[0].details).toEqual({
      duplicate_of_id: expect.any(Number),
      duplicate_of_doc: doc1,
    })
  })

  it('does NOT flag transactions with different amounts', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')

    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 50.0, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 75.0, 'debit')

    const count = detectDuplicates(db)
    expect(count).toBe(0)
  })

  it('does NOT flag transactions with different types', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')

    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 50.0, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 50.0, 'credit')

    const count = detectDuplicates(db)
    expect(count).toBe(0)
  })

  it('detects same-document debit+credit duplicates and flags credit side', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-02-01', 'Internal Transfer', 200.0, 'debit')
    insertTxn(db, doc1, '2025-02-01', 'Internal Transfer', 200.0, 'credit')

    const count = detectDuplicates(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db, 'duplicate')
    expect(flags).toHaveLength(1)
    expect(flags[0].type).toBe('credit') // credit side flagged
  })

  it('scopes detection to a specific document when documentId is provided', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')
    const doc3 = insertDoc(db, 'statement3.pdf')

    // doc1 and doc2 share a duplicate
    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 50.0, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 50.0, 'debit')

    // doc1 and doc3 share a duplicate
    insertTxn(db, doc1, '2025-01-20', 'Acme Gym', 30.0, 'debit')
    insertTxn(db, doc3, '2025-01-20', 'Acme Gym', 30.0, 'debit')

    // Only check doc2
    const count = detectDuplicates(db, doc2)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db, 'duplicate')
    expect(flags).toHaveLength(1)
    expect(flags[0].document_id).toBe(doc2)
  })

  it('is idempotent — running twice does not double-flag', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')

    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 50.0, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 50.0, 'debit')

    const count1 = detectDuplicates(db)
    expect(count1).toBe(1)

    const count2 = detectDuplicates(db)
    expect(count2).toBe(0)

    const flags = getUnresolvedFlags(db, 'duplicate')
    expect(flags).toHaveLength(1)
  })
})

describe('detectCategoryMismatches', () => {
  it('flags ATM withdrawals in wrong category', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'ATM Withdrawal #1234', 100.0, 'debit', 'Other')
    insertTxn(db, doc1, '2025-01-11', 'ATM W/D Downtown', 200.0, 'debit', 'Fees & Charges')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(2)

    const flags = getUnresolvedFlags(db, 'category_mismatch')
    expect(flags).toHaveLength(2)
    expect(flags[0].details).toMatchObject({ suggested_category: 'ATM Withdrawal' })
  })

  it('does NOT flag ATM withdrawals already in correct category', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'ATM Withdrawal #1234', 100.0, 'debit', 'ATM Withdrawal')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(0)
  })

  it('flags checks with auto-assigned non-Other category', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'Check #1001', 500.0, 'debit', 'Groceries', 0)
    insertTxn(db, doc1, '2025-01-12', 'Check 2002', 300.0, 'debit', 'Utilities', 0)

    const count = detectCategoryMismatches(db)
    expect(count).toBe(2)

    const flags = getUnresolvedFlags(db, 'category_mismatch')
    expect(flags).toHaveLength(2)
    expect(flags[0].details).toMatchObject({
      suggested_category: null,
      reason: 'Check number — category may be incorrect',
    })
  })

  it('does NOT flag checks categorized as Other', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'Check #1001', 500.0, 'debit', 'Other', 0)

    const count = detectCategoryMismatches(db)
    expect(count).toBe(0)
  })

  it('does NOT flag checks with manual_category=1', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'Check #1001', 500.0, 'debit', 'Groceries', 1)

    const count = detectCategoryMismatches(db)
    expect(count).toBe(0)
  })

  it('scopes detection to a specific document when documentId is provided', () => {
    const doc1 = insertDoc(db, 'statement1.pdf')
    const doc2 = insertDoc(db, 'statement2.pdf')

    insertTxn(db, doc1, '2025-01-10', 'ATM Withdrawal #1', 100.0, 'debit', 'Other')
    insertTxn(db, doc2, '2025-01-11', 'ATM Withdrawal #2', 200.0, 'debit', 'Other')

    const count = detectCategoryMismatches(db, doc1)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db, 'category_mismatch')
    expect(flags).toHaveLength(1)
    expect(flags[0].amount).toBe(100.0)
  })

  it('is idempotent — running twice does not double-flag', () => {
    const doc1 = insertDoc(db)

    insertTxn(db, doc1, '2025-01-10', 'ATM Withdrawal #1234', 100.0, 'debit', 'Other')

    const count1 = detectCategoryMismatches(db)
    expect(count1).toBe(1)

    const count2 = detectCategoryMismatches(db)
    expect(count2).toBe(0)

    const flags = getUnresolvedFlags(db, 'category_mismatch')
    expect(flags).toHaveLength(1)
  })
})
