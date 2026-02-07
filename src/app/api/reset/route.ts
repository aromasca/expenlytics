import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST() {
  const db = getDb()
  db.exec('DELETE FROM transactions')
  db.exec('DELETE FROM documents')
  return NextResponse.json({ ok: true })
}
