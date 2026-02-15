import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, updateDocumentStatus, updateDocumentPhase } from '@/lib/db/documents'
import { getTransactionsByDocumentId, bulkUpdateCategories } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'
import { enqueueDocument } from '@/lib/pipeline'
import { getModelForTask } from '@/lib/claude/models'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const doc = getDocument(db, Number(id))

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.status === 'processing') {
    return NextResponse.json({ error: 'Document is currently processing' }, { status: 409 })
  }

  const classificationModel = getModelForTask(db, 'classification')
  const normalizationModel = getModelForTask(db, 'normalization')

  updateDocumentStatus(db, Number(id), 'processing')
  updateDocumentPhase(db, Number(id), 'classification')

  // Enqueue for sequential processing — only one document at a time
  enqueueDocument(() => reprocessInBackground(Number(id), doc.document_type ?? 'other', classificationModel, normalizationModel))

  return NextResponse.json({ status: 'processing' })
}

async function reprocessInBackground(
  docId: number,
  documentType: string,
  classificationModel: string,
  normalizationModel: string
) {
  const db = getDb()
  try {
    const transactions = getTransactionsByDocumentId(db, docId)
    const reclassifyInput = transactions
      .filter(t => t.manual_category === 0)
      .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

    if (reclassifyInput.length === 0) {
      updateDocumentStatus(db, docId, 'completed')
      updateDocumentPhase(db, docId, 'complete')
      return
    }

    const result = await reclassifyTransactions(documentType, reclassifyInput, classificationModel)

    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    const updates = result.classifications.map(c => ({
      transactionId: c.id,
      categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
    }))
    bulkUpdateCategories(db, updates)

    // Re-normalize merchants
    updateDocumentPhase(db, docId, 'normalization')
    try {
      const descriptions = transactions.map(t => t.description)
      const merchantMap = await normalizeMerchants(descriptions, normalizationModel)
      const normalizeStmt = db.prepare('UPDATE transactions SET normalized_merchant = ? WHERE id = ? AND manual_category = 0')
      for (const t of transactions) {
        const normalized = merchantMap.get(t.description)
        if (normalized) {
          normalizeStmt.run(normalized, t.id)
        }
      }
    } catch {
      // Normalization failure is non-blocking
    }

    updateDocumentStatus(db, docId, 'completed')
    updateDocumentPhase(db, docId, 'complete')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', `Reprocess failed: ${message}`)
  }
}
