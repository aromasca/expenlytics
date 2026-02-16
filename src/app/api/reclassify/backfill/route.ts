import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllCategories } from '@/lib/db/categories'
import { bulkUpdateCategories } from '@/lib/db/transactions'
import { reclassifyTransactions } from '@/lib/llm/extract-transactions'
import { getProviderForTask } from '@/lib/llm/factory'

interface TransactionRow {
  id: number
  date: string
  description: string
  amount: number
  type: string
  document_type: string | null
}

const BATCH_SIZE = 50

export async function POST() {
  const db = getDb()
  const { provider, providerName, model: classificationModel } = getProviderForTask(db, 'classification')

  // Get all non-manual transactions
  const transactions = db.prepare(`
    SELECT t.id, t.date, t.description, t.amount, t.type, d.document_type
    FROM transactions t
    JOIN documents d ON t.document_id = d.id
    WHERE t.manual_category = 0
    ORDER BY t.id
  `).all() as TransactionRow[]

  if (transactions.length === 0) {
    return NextResponse.json({ total: 0, updated: 0, message: 'No transactions to reclassify' })
  }

  const categories = getAllCategories(db)
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
  const otherCategoryId = categoryMap.get('other')!

  let totalUpdated = 0

  // Group by document type for better classification context
  const byDocType = new Map<string, TransactionRow[]>()
  for (const t of transactions) {
    const docType = t.document_type || 'other'
    if (!byDocType.has(docType)) byDocType.set(docType, [])
    byDocType.get(docType)!.push(t)
  }

  try {
    for (const [docType, txns] of byDocType) {
      // Process in batches
      for (let i = 0; i < txns.length; i += BATCH_SIZE) {
        const batch = txns.slice(i, i + BATCH_SIZE)
        const input = batch.map(t => ({
          id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type,
        }))

        const result = await reclassifyTransactions(provider, providerName, docType, input, classificationModel)
        const updates = result.classifications.map(c => ({
          transactionId: c.id,
          categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
        }))
        bulkUpdateCategories(db, updates)
        totalUpdated += updates.length
      }
    }

    return NextResponse.json({ total: transactions.length, updated: totalUpdated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Backfill failed: ${message}` }, { status: 500 })
  }
}
