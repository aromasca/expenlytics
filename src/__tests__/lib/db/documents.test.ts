import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument, getDocument, updateDocumentStatus } from '@/lib/db/documents'

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
})
