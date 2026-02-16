import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, updateDocumentStatus, updateDocumentPhase } from '@/lib/db/documents'
import { getTransactionsByDocumentId, bulkUpdateCategories } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'
import { reclassifyTransactions } from '@/lib/llm/extract-transactions'
import { normalizeMerchants } from '@/lib/llm/normalize-merchants'
import { enqueueDocument } from '@/lib/pipeline'
import { getProviderForTask, type ProviderForTask } from '@/lib/llm/factory'

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

  const classificationConfig = getProviderForTask(db, 'classification')
  const normalizationConfig = getProviderForTask(db, 'normalization')

  updateDocumentStatus(db, Number(id), 'processing')
  updateDocumentPhase(db, Number(id), 'classification')

  // Enqueue for sequential processing — only one document at a time
  enqueueDocument(() => reprocessInBackground(Number(id), doc.document_type ?? 'other', classificationConfig, normalizationConfig))

  return NextResponse.json({ status: 'processing' })
}

async function reprocessInBackground(
  docId: number,
  documentType: string,
  classificationConfig: ProviderForTask,
  normalizationConfig: ProviderForTask
) {
  const db = getDb()
  try {
    console.log(`[reprocess] Document ${docId}: starting (${classificationConfig.providerName}/${classificationConfig.model})`)
    const transactions = getTransactionsByDocumentId(db, docId)
    const reclassifyInput = transactions
      .filter(t => t.manual_category === 0)
      .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

    if (reclassifyInput.length === 0) {
      console.log(`[reprocess] Document ${docId}: no transactions to reclassify (all manual)`)
      updateDocumentStatus(db, docId, 'completed')
      updateDocumentPhase(db, docId, 'complete')
      return
    }

    console.log(`[reprocess] Document ${docId}: classification starting (${reclassifyInput.length} transactions)...`)
    const t0 = Date.now()
    const result = await reclassifyTransactions(classificationConfig.provider, classificationConfig.providerName, documentType, reclassifyInput, classificationConfig.model)
    console.log(`[reprocess] Document ${docId}: classification complete — ${result.classifications.length} classified (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

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
      console.log(`[reprocess] Document ${docId}: normalization starting (${descriptions.length} descriptions)...`)
      const t1 = Date.now()
      const merchantMap = await normalizeMerchants(normalizationConfig.provider, normalizationConfig.providerName, descriptions, normalizationConfig.model)
      console.log(`[reprocess] Document ${docId}: normalization complete — ${merchantMap.size} normalized (${((Date.now() - t1) / 1000).toFixed(1)}s)`)
      const normalizeStmt = db.prepare('UPDATE transactions SET normalized_merchant = ? WHERE id = ? AND manual_category = 0')
      for (const t of transactions) {
        const normalized = merchantMap.get(t.description)
        if (normalized) {
          normalizeStmt.run(normalized, t.id)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[reprocess] Document ${docId}: normalization failed (non-blocking) — ${message}`)
    }

    updateDocumentStatus(db, docId, 'completed')
    updateDocumentPhase(db, docId, 'complete')
    console.log(`[reprocess] Document ${docId}: COMPLETE ✓`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[reprocess] Document ${docId}: FAILED — ${message}`)
    updateDocumentStatus(db, docId, 'failed', `Reprocess failed: ${message}`)
  }
}
