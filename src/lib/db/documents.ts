import type Database from 'better-sqlite3'

export interface Document {
  id: number
  filename: string
  filepath: string
  file_hash: string
  document_type: string | null
  uploaded_at: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  processing_phase: string | null
  raw_extraction: string | null
  transaction_count: number | null
}

export function createDocument(db: Database.Database, filename: string, filepath: string, fileHash: string = ''): number {
  const result = db.prepare('INSERT INTO documents (filename, filepath, file_hash) VALUES (?, ?, ?)').run(filename, filepath, fileHash)
  return result.lastInsertRowid as number
}

export function getDocument(db: Database.Database, id: number): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined
}

export function updateDocumentStatus(db: Database.Database, id: number, status: Document['status'], errorMessage?: string): void {
  db.prepare('UPDATE documents SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage ?? null, id)
}

export function findDocumentByHash(db: Database.Database, fileHash: string): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE file_hash = ?').get(fileHash) as Document | undefined
}

export function updateDocumentType(db: Database.Database, id: number, documentType: string): void {
  db.prepare('UPDATE documents SET document_type = ? WHERE id = ?').run(documentType, id)
}

export function listDocuments(db: Database.Database): Document[] {
  return db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC, id DESC').all() as Document[]
}

export function deleteOrphanedDocuments(db: Database.Database): number {
  const result = db.prepare(`
    DELETE FROM documents
    WHERE status IN ('completed', 'failed')
      AND NOT EXISTS (SELECT 1 FROM transactions WHERE transactions.document_id = documents.id)
  `).run()
  return result.changes
}

export type ProcessingPhase = 'upload' | 'extraction' | 'classification' | 'normalization' | 'complete'

export function updateDocumentPhase(db: Database.Database, id: number, phase: ProcessingPhase): void {
  db.prepare('UPDATE documents SET processing_phase = ? WHERE id = ?').run(phase, id)
}

export function updateDocumentRawExtraction(db: Database.Database, id: number, rawData: unknown): void {
  db.prepare('UPDATE documents SET raw_extraction = ? WHERE id = ?').run(JSON.stringify(rawData), id)
}

export function getDocumentRawExtraction(db: Database.Database, id: number): unknown | null {
  const row = db.prepare('SELECT raw_extraction FROM documents WHERE id = ?').get(id) as { raw_extraction: string | null } | undefined
  if (!row?.raw_extraction) return null
  return JSON.parse(row.raw_extraction)
}

export function updateDocumentTransactionCount(db: Database.Database, id: number, count: number): void {
  db.prepare('UPDATE documents SET transaction_count = ? WHERE id = ?').run(count, id)
}

export interface DocumentWithCounts extends Document {
  actual_transaction_count: number
}

const VALID_SORT_COLUMNS = ['filename', 'uploaded_at', 'document_type', 'status', 'actual_transaction_count'] as const
type DocumentSortBy = typeof VALID_SORT_COLUMNS[number]

export function listDocumentsWithCounts(
  db: Database.Database,
  sortBy: DocumentSortBy = 'uploaded_at',
  sortOrder: 'asc' | 'desc' = 'desc'
): DocumentWithCounts[] {
  const validatedSort = VALID_SORT_COLUMNS.includes(sortBy) ? sortBy : 'uploaded_at'
  const validatedOrder = sortOrder === 'asc' ? 'ASC' : 'DESC'
  const orderExpr = validatedSort === 'actual_transaction_count'
    ? `COUNT(t.id) ${validatedOrder}`
    : `d.${validatedSort} ${validatedOrder}`

  return db.prepare(`
    SELECT d.*, COUNT(t.id) as actual_transaction_count
    FROM documents d
    LEFT JOIN transactions t ON t.document_id = d.id
    GROUP BY d.id
    ORDER BY ${orderExpr}, d.id DESC
  `).all() as DocumentWithCounts[]
}

export function deleteDocument(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}
