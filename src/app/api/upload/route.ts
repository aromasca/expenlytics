import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getDb } from '@/lib/db'
import { createDocument, findDocumentByHash, updateDocumentStatus } from '@/lib/db/documents'
import { processDocument, enqueueDocument } from '@/lib/pipeline'

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }

  const db = getDb()
  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = computeHash(buffer)

  // Check for existing document with same hash
  const existingDoc = findDocumentByHash(db, fileHash)

  if (existingDoc) {
    return NextResponse.json(
      { error: `This file has already been uploaded as "${existingDoc.filename}"` },
      { status: 409 }
    )
  }

  // New file — save and start background processing
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
  await mkdir(uploadsDir, { recursive: true })

  const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${Date.now()}-${sanitizedName}`
  const filepath = path.join(uploadsDir, filename)

  const resolvedUploadsDir = path.resolve(uploadsDir)
  const resolvedFilepath = path.resolve(filepath)
  if (!resolvedFilepath.startsWith(resolvedUploadsDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  await writeFile(filepath, buffer)

  const docId = createDocument(db, file.name, filepath, fileHash)
  updateDocumentStatus(db, docId, 'processing')

  // Enqueue for sequential processing — only one document at a time
  enqueueDocument(() => processDocument(db, docId)).catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', message)
  })

  return NextResponse.json({
    document_id: docId,
    action: 'processing',
    status: 'processing',
  })
}
