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
