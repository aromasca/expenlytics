import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument, getDocument, updateDocumentStatus, findDocumentByHash, updateDocumentType, listDocuments, deleteOrphanedDocuments, updateDocumentPhase, updateDocumentRawExtraction, getDocumentRawExtraction, updateDocumentTransactionCount, listDocumentsWithCounts, deleteDocument } from '@/lib/db/documents'
import { insertTransactions, deleteTransactions, listTransactions } from '@/lib/db/transactions'

describe('documents', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('creates and retrieves a document', () => {
    const id = createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf')
    const doc = getDocument(db, id)
    expect(doc).toBeDefined()
    expect(doc!.filename).toBe('statement.pdf')
    expect(doc!.status).toBe('pending')
  })

  it('updates document status', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf')
    updateDocumentStatus(db, id, 'completed')
    const doc = getDocument(db, id)
    expect(doc!.status).toBe('completed')
  })

  it('updates document status with error', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf')
    updateDocumentStatus(db, id, 'failed', 'Parse error')
    const doc = getDocument(db, id)
    expect(doc!.status).toBe('failed')
    expect(doc!.error_message).toBe('Parse error')
  })

  it('creates document with file hash', () => {
    const id = createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'abc123hash')
    const doc = getDocument(db, id)
    expect(doc!.file_hash).toBe('abc123hash')
  })

  it('finds document by file hash', () => {
    createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'sha256hashvalue')
    const doc = findDocumentByHash(db, 'sha256hashvalue')
    expect(doc).toBeDefined()
    expect(doc!.filename).toBe('statement.pdf')
  })

  it('returns undefined for unknown hash', () => {
    const doc = findDocumentByHash(db, 'nonexistent')
    expect(doc).toBeUndefined()
  })

  it('stores and retrieves document type', () => {
    const id = createDocument(db, 'cc.pdf', '/data/uploads/cc.pdf', 'hash123')
    updateDocumentType(db, id, 'credit_card')
    const doc = getDocument(db, id)
    expect(doc!.document_type).toBe('credit_card')
  })

  it('lists all documents ordered by upload date desc', () => {
    createDocument(db, 'first.pdf', '/data/first.pdf', 'hash1')
    createDocument(db, 'second.pdf', '/data/second.pdf', 'hash2')
    const docs = listDocuments(db)
    expect(docs).toHaveLength(2)
    expect(docs[0].filename).toBe('second.pdf')
    expect(docs[1].filename).toBe('first.pdf')
  })

  it('deletes completed documents with no remaining transactions', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash123')
    updateDocumentStatus(db, id, 'completed')
    insertTransactions(db, id, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])
    const txns = listTransactions(db, { document_id: id })
    deleteTransactions(db, txns.transactions.map(t => t.id))

    const deleted = deleteOrphanedDocuments(db)
    expect(deleted).toBe(1)
    expect(getDocument(db, id)).toBeUndefined()
  })

  it('preserves documents that still have transactions', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash456')
    updateDocumentStatus(db, id, 'completed')
    insertTransactions(db, id, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])

    const deleted = deleteOrphanedDocuments(db)
    expect(deleted).toBe(0)
    expect(getDocument(db, id)).toBeDefined()
  })

  it('allows re-upload after deleting all transactions (full flow)', () => {
    const id = createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'reupload-hash')
    updateDocumentStatus(db, id, 'completed')
    insertTransactions(db, id, [
      { date: '2025-01-15', description: 'Grocery Store', amount: 85, type: 'debit' },
      { date: '2025-01-16', description: 'Gas Station', amount: 45, type: 'debit' },
    ])

    expect(findDocumentByHash(db, 'reupload-hash')).toBeDefined()

    const txns = listTransactions(db, { document_id: id })
    deleteTransactions(db, txns.transactions.map(t => t.id))
    deleteOrphanedDocuments(db)

    expect(findDocumentByHash(db, 'reupload-hash')).toBeUndefined()
  })

  it('preserves pending/processing documents even with no transactions', () => {
    const id1 = createDocument(db, 'pending.pdf', '/path/pending.pdf', 'hashA')
    const id2 = createDocument(db, 'processing.pdf', '/path/processing.pdf', 'hashB')
    updateDocumentStatus(db, id2, 'processing')

    const deleted = deleteOrphanedDocuments(db)
    expect(deleted).toBe(0)
    expect(getDocument(db, id1)).toBeDefined()
    expect(getDocument(db, id2)).toBeDefined()
  })

  it('stores and retrieves processing_phase', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentPhase(db, id, 'extraction')
    const doc = getDocument(db, id)
    expect(doc!.processing_phase).toBe('extraction')
  })

  it('stores and retrieves raw_extraction JSON', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    const rawData = {
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'WHOLE FOODS', amount: 85.50, type: 'debit' },
      ],
    }
    updateDocumentRawExtraction(db, id, rawData)
    const stored = getDocumentRawExtraction(db, id)
    expect(stored).toEqual(rawData)
  })

  it('stores and retrieves transaction_count', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentTransactionCount(db, id, 42)
    const doc = getDocument(db, id)
    expect(doc!.transaction_count).toBe(42)
  })

  it('new documents have null processing_phase and raw_extraction', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    const doc = getDocument(db, id)
    expect(doc!.processing_phase).toBeNull()
    expect(doc!.transaction_count).toBeNull()
  })

  it('lists documents with transaction counts via listDocumentsWithCounts', () => {
    const id1 = createDocument(db, 'jan.pdf', '/path/jan.pdf', 'hash1')
    updateDocumentStatus(db, id1, 'completed')
    insertTransactions(db, id1, [
      { date: '2025-01-15', description: 'Store A', amount: 50, type: 'debit' },
      { date: '2025-01-16', description: 'Store B', amount: 30, type: 'debit' },
    ])

    const id2 = createDocument(db, 'feb.pdf', '/path/feb.pdf', 'hash2')
    updateDocumentStatus(db, id2, 'processing')

    const docs = listDocumentsWithCounts(db)
    expect(docs).toHaveLength(2)
    expect(docs[0].filename).toBe('feb.pdf') // newest first
    expect(docs[0].actual_transaction_count).toBe(0)
    expect(docs[1].filename).toBe('jan.pdf')
    expect(docs[1].actual_transaction_count).toBe(2)
  })

  it('deleteDocument removes document and cascades to transactions', () => {
    const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, id, 'completed')
    insertTransactions(db, id, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])

    deleteDocument(db, id)

    expect(getDocument(db, id)).toBeUndefined()
    const { transactions } = listTransactions(db, { document_id: id })
    expect(transactions).toHaveLength(0)
  })
})
