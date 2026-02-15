import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listDocumentsWithCounts } from '@/lib/db/documents'

export async function GET() {
  const db = getDb()
  const documents = listDocumentsWithCounts(db)
  return NextResponse.json(documents)
}
