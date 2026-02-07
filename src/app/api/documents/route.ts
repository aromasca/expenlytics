import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listDocuments } from '@/lib/db/documents'

export async function GET() {
  const db = getDb()
  const documents = listDocuments(db)
  return NextResponse.json(documents)
}
