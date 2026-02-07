import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { getTransactionsByDocumentId, bulkUpdateCategories } from '@/lib/db/transactions'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'

export async function POST(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params
  const db = getDb()

  const doc = getDocument(db, Number(documentId))
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const transactions = getTransactionsByDocumentId(db, doc.id)
  if (transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions to reclassify' }, { status: 400 })
  }

  const reclassifyInput = transactions
    .filter(t => t.manual_category === 0)
    .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

  if (reclassifyInput.length === 0) {
    return NextResponse.json({
      document_id: doc.id,
      transactions_updated: 0,
      message: 'All transactions have manual overrides',
    })
  }

  try {
    const result = await reclassifyTransactions(doc.document_type ?? 'other', reclassifyInput)

    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    const updates = result.classifications.map(c => ({
      transactionId: c.id,
      categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
    }))
    bulkUpdateCategories(db, updates)

    return NextResponse.json({
      document_id: doc.id,
      transactions_updated: updates.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Reclassification failed: ${message}` }, { status: 500 })
  }
}
