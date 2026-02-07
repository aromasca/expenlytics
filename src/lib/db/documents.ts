import type Database from 'better-sqlite3'

export interface Document {
  id: number
  filename: string
  filepath: string
  uploaded_at: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
}

export function createDocument(db: Database.Database, filename: string, filepath: string): number {
  const result = db.prepare('INSERT INTO documents (filename, filepath) VALUES (?, ?)').run(filename, filepath)
  return result.lastInsertRowid as number
}

export function getDocument(db: Database.Database, id: number): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Document | undefined
}

export function updateDocumentStatus(db: Database.Database, id: number, status: Document['status'], errorMessage?: string): void {
  db.prepare('UPDATE documents SET status = ?, error_message = ? WHERE id = ?').run(status, errorMessage ?? null, id)
}
