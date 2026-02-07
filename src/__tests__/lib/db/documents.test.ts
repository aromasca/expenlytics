import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument, getDocument, updateDocumentStatus, findDocumentByHash, updateDocumentType } from '@/lib/db/documents'

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
})
