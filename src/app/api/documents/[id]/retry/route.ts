import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, updateDocumentStatus } from '@/lib/db/documents'
import { processDocument, enqueueDocument } from '@/lib/pipeline'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const docId = Number(id)
  if (isNaN(docId)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
  }

  const db = getDb()
  const doc = getDocument(db, docId)

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.status === 'processing') {
    return NextResponse.json({ error: 'Document is currently processing' }, { status: 409 })
  }

  updateDocumentStatus(db, docId, 'processing')

  // Enqueue for sequential processing — only one document at a time
  enqueueDocument(() => processDocument(db, docId)).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', message)
  })

  return NextResponse.json({ status: 'processing' })
}
