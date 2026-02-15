import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, deleteDocument } from '@/lib/db/documents'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const doc = getDocument(db, Number(id))
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json(doc)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const doc = getDocument(db, Number(id))
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  deleteDocument(db, Number(id))
  return NextResponse.json({ success: true })
}
