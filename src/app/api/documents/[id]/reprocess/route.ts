import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, updateDocumentStatus, updateDocumentPhase } from '@/lib/db/documents'
import { getTransactionsByDocumentId, bulkUpdateCategories } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

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

  updateDocumentStatus(db, Number(id), 'processing')
  updateDocumentPhase(db, Number(id), 'classification')

  try {
    const transactions = getTransactionsByDocumentId(db, Number(id))
    const reclassifyInput = transactions
      .filter(t => t.manual_category === 0)
      .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

    if (reclassifyInput.length === 0) {
      updateDocumentStatus(db, Number(id), 'completed')
      updateDocumentPhase(db, Number(id), 'complete')
      return NextResponse.json({ updated: 0, message: 'All transactions have manual overrides' })
    }

    const result = await reclassifyTransactions(doc.document_type ?? 'other', reclassifyInput)

    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    const updates = result.classifications.map(c => ({
      transactionId: c.id,
      categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
    }))
    bulkUpdateCategories(db, updates)

    // Re-normalize merchants
    updateDocumentPhase(db, Number(id), 'normalization')
    try {
      const descriptions = transactions.map(t => t.description)
      const merchantMap = await normalizeMerchants(descriptions)
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

    updateDocumentStatus(db, Number(id), 'completed')
    updateDocumentPhase(db, Number(id), 'complete')

    return NextResponse.json({ updated: updates.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, Number(id), 'failed', `Reprocess failed: ${message}`)
    return NextResponse.json({ error: `Reprocess failed: ${message}` }, { status: 500 })
  }
}
