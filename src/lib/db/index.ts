import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { initializeSchema } from './schema'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.join(process.cwd(), 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    const dbPath = path.join(dataDir, 'expenlytics.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema(db)
  }
  return db
}
