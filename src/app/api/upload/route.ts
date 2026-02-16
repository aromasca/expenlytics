import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getDb } from '@/lib/db'
import { createDocument, findDocumentByHash, updateDocumentStatus } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { getTransactionsByDocumentId, bulkUpdateCategories } from '@/lib/db/transactions'
import { reclassifyTransactions } from '@/lib/llm/extract-transactions'
import { processDocument, enqueueDocument } from '@/lib/pipeline'
import { getProviderForTask } from '@/lib/llm/factory'

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
    // Same file — reclassify only
    try {
      const transactions = getTransactionsByDocumentId(db, existingDoc.id)
      if (transactions.length === 0) {
        return NextResponse.json({ error: 'No transactions to reclassify' }, { status: 400 })
      }

      const reclassifyInput = transactions
        .filter(t => t.manual_category === 0)
        .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

      if (reclassifyInput.length === 0) {
        return NextResponse.json({
          document_id: existingDoc.id,
          action: 'reclassify',
          transactions_updated: 0,
          message: 'All transactions have manual overrides',
        })
      }

      const { provider, providerName, model: classificationModel } = getProviderForTask(db, 'classification')
      const result = await reclassifyTransactions(provider, providerName, existingDoc.document_type ?? 'other', reclassifyInput, classificationModel)

      const categories = getAllCategories(db)
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
      const otherCategoryId = categoryMap.get('other')!

      const updates = result.classifications.map(c => ({
        transactionId: c.id,
        categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
      }))
      bulkUpdateCategories(db, updates)

      return NextResponse.json({
        document_id: existingDoc.id,
        action: 'reclassify',
        transactions_updated: updates.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: `Reclassification failed: ${message}` }, { status: 500 })
    }
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
