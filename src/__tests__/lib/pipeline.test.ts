import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument, getDocument, updateDocumentStatus } from '@/lib/db/documents'
import { listTransactions } from '@/lib/db/transactions'

// Module-level spies
const mockExtractRaw = vi.fn()
const mockClassify = vi.fn()
const mockNormalize = vi.fn()

vi.mock('@/lib/claude/extract-transactions', () => ({
  extractRawTransactions: (...args: unknown[]) => mockExtractRaw(...args),
  classifyTransactions: (...args: unknown[]) => mockClassify(...args),
}))

vi.mock('@/lib/claude/normalize-merchants', () => ({
  normalizeMerchants: (...args: unknown[]) => mockNormalize(...args),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake pdf')),
}))

import { processDocument } from '@/lib/pipeline'

describe('processDocument', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.clearAllMocks()
  })

  it('processes a document through all phases', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', transaction_class: 'purchase' },
        { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit', transaction_class: 'purchase' },
      ],
    })

    mockClassify.mockResolvedValue({
      classifications: [
        { index: 0, category: 'Groceries' },
        { index: 1, category: 'Salary & Wages' },
      ],
    })

    mockNormalize.mockResolvedValue(new Map([
      ['Whole Foods', 'Whole Foods Market'],
    ]))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('completed')
    expect(doc!.processing_phase).toBe('complete')
    expect(doc!.document_type).toBe('checking_account')
    expect(doc!.raw_extraction).not.toBeNull()
    expect(doc!.transaction_count).toBe(2)

    const { transactions } = listTransactions(db, { document_id: docId })
    expect(transactions).toHaveLength(2)
    const groceryTxn = transactions.find(t => t.description === 'Whole Foods')
    expect(groceryTxn!.category_name).toBe('Groceries')

    // Check normalized_merchant on the raw row
    const rawRow = db.prepare('SELECT normalized_merchant, transaction_class FROM transactions WHERE description = ?').get('Whole Foods') as { normalized_merchant: string | null; transaction_class: string | null }
    expect(rawRow.normalized_merchant).toBe('Whole Foods Market')
    expect(rawRow.transaction_class).toBe('purchase')
  })

  it('stores raw extraction data on the document', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    const rawData = {
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'Amazon', amount: 42.99, type: 'debit', transaction_class: 'purchase' },
      ],
    }
    mockExtractRaw.mockResolvedValue(rawData)
    mockClassify.mockResolvedValue({
      classifications: [{ index: 0, category: 'General Merchandise' }],
    })
    mockNormalize.mockResolvedValue(new Map())

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    const stored = JSON.parse(doc!.raw_extraction!)
    expect(stored.document_type).toBe('credit_card')
    expect(stored.transactions).toHaveLength(1)
  })

  it('sets status to failed with phase on extraction error', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockRejectedValue(new Error('API timeout'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('failed')
    expect(doc!.processing_phase).toBe('extraction')
    expect(doc!.error_message).toContain('API timeout')
  })

  it('sets status to failed with phase on classification error', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [{ date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', transaction_class: 'purchase' }],
    })
    mockClassify.mockRejectedValue(new Error('Classification failed'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('failed')
    expect(doc!.processing_phase).toBe('classification')
  })

  it('completes even if normalization fails', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [{ date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', transaction_class: 'purchase' }],
    })
    mockClassify.mockResolvedValue({
      classifications: [{ index: 0, category: 'General Merchandise' }],
    })
    mockNormalize.mockRejectedValue(new Error('Normalization timeout'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('completed')
    expect(doc!.processing_phase).toBe('complete')
    const { transactions } = listTransactions(db, { document_id: docId })
    expect(transactions).toHaveLength(1)
  })
})
