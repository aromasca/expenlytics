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
    resumeStuckDocuments(db)
    autoSeedDemoData(db)
  }
  return db
}

function autoSeedDemoData(database: Database.Database): void {
  if (process.env.DEMO_MODE !== 'true') return
  const row = database.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }
  if (row.count > 0) return
  console.log('[startup] DEMO_MODE=true and DB is empty — seeding demo data')
  // Dynamic import to avoid bundling demo data when not needed
  import('@/lib/demo/seed').then(({ insertDemoData }) => {
    insertDemoData(database)
    console.log('[startup] Demo data seeded successfully')
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[startup] Failed to seed demo data: ${message}`)
  })
}

function resumeStuckDocuments(database: Database.Database): void {
  const stuck = database.prepare(
    "SELECT id, filename, processing_phase FROM documents WHERE status = 'processing'"
  ).all() as Array<{ id: number; filename: string; processing_phase: string | null }>

  if (stuck.length === 0) return

  console.log(`[startup] Found ${stuck.length} document(s) stuck in processing — re-enqueueing`)

  // Dynamic import to avoid circular dependency (pipeline imports from db)
  import('@/lib/pipeline').then(({ processDocument, enqueueDocument }) => {
    for (const doc of stuck) {
      console.log(`[startup]   Document ${doc.id}: "${doc.filename}" (phase: ${doc.processing_phase ?? 'unknown'}) — resuming`)
      enqueueDocument(() => processDocument(database, doc.id)).catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[startup]   Document ${doc.id}: resume FAILED — ${message}`)
        database.prepare("UPDATE documents SET status = 'failed', error_message = ? WHERE id = ?")
          .run(`Resume failed: ${message}`, doc.id)
      })
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[startup] Failed to load pipeline module — marking ${stuck.length} document(s) as failed: ${message}`)
    for (const doc of stuck) {
      database.prepare("UPDATE documents SET status = 'failed', error_message = ? WHERE id = ?")
        .run(`Resume failed: pipeline module unavailable — ${message}`, doc.id)
    }
  })
}
