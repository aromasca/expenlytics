import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getDb } from '@/lib/db'
import { createDocument, findDocumentByHash, updateDocumentStatus, updateDocumentType } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { getTransactionsByDocumentId, findDuplicateTransaction, bulkUpdateCategories } from '@/lib/db/transactions'
import { extractTransactions } from '@/lib/claude/extract-transactions'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

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

      const result = await reclassifyTransactions(existingDoc.document_type ?? 'other', reclassifyInput)

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

  // New file — extract and merge
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
  await mkdir(uploadsDir, { recursive: true })

  // Sanitize filename to prevent path traversal attacks
  const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${Date.now()}-${sanitizedName}`
  const filepath = path.join(uploadsDir, filename)

  // Validate the resolved path is still within uploads directory
  const resolvedUploadsDir = path.resolve(uploadsDir)
  const resolvedFilepath = path.resolve(filepath)
  if (!resolvedFilepath.startsWith(resolvedUploadsDir + path.sep)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  await writeFile(filepath, buffer)

  const docId = createDocument(db, file.name, filepath, fileHash)
  updateDocumentStatus(db, docId, 'processing')

  try {
    const result = await extractTransactions(buffer)

    // Store detected document type
    updateDocumentType(db, docId, result.document_type)

    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    // Normalize merchant names via LLM
    const descriptions = result.transactions.map(t => t.description)
    const merchantMap = await normalizeMerchants(descriptions)

    const insert = db.prepare(
      'INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    let newCount = 0
    let reclassifiedCount = 0
    const reclassifyUpdates: Array<{ transactionId: number; categoryId: number }> = []

    const mergeTransaction = db.transaction(() => {
      for (const t of result.transactions) {
        const categoryId = categoryMap.get(t.category.toLowerCase()) ?? otherCategoryId
        const existing = findDuplicateTransaction(db, {
          date: t.date, description: t.description, amount: t.amount, type: t.type,
        })

        if (existing) {
          // Duplicate — queue reclassification (respects manual flag via bulkUpdateCategories)
          reclassifyUpdates.push({ transactionId: existing.id, categoryId })
          reclassifiedCount++
        } else {
          // New transaction
          const normalizedMerchant = merchantMap.get(t.description) ?? t.description
          insert.run(docId, t.date, t.description, t.amount, t.type, categoryId, normalizedMerchant)
          newCount++
        }
      }
    })
    mergeTransaction()

    if (reclassifyUpdates.length > 0) {
      bulkUpdateCategories(db, reclassifyUpdates)
    }

    updateDocumentStatus(db, docId, 'completed')

    return NextResponse.json({
      document_id: docId,
      action: 'extract_and_merge',
      transactions_new: newCount,
      transactions_reclassified: reclassifiedCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', message)
    return NextResponse.json({ error: `Extraction failed: ${message}` }, { status: 500 })
  }
}
