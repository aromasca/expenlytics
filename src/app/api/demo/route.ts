import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { insertDemoData, clearDemoData, isDemoMode } from '@/lib/demo/seed'

export async function GET() {
  const db = getDb()
  const demo = isDemoMode(db)
  const row = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }
  return NextResponse.json({ demo, hasData: row.count > 0 })
}

export async function POST() {
  const db = getDb()

  // Refuse to overwrite real data — only allow loading into an empty DB or replacing existing demo data
  const row = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }
  if (row.count > 0 && !isDemoMode(db)) {
    return NextResponse.json(
      { error: 'Cannot load demo data while real data exists. Reset the database first.' },
      { status: 409 }
    )
  }

  clearDemoData(db)
  insertDemoData(db)
  return NextResponse.json({ ok: true, mode: 'demo' })
}

export async function DELETE() {
  const db = getDb()
  if (!isDemoMode(db)) {
    return NextResponse.json(
      { error: 'Not in demo mode' },
      { status: 409 }
    )
  }
  clearDemoData(db)
  return NextResponse.json({ ok: true, mode: 'normal' })
}
