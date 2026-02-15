import type Database from 'better-sqlite3'
import { getDocument, updateDocumentStatus, updateDocumentPhase, updateDocumentType, updateDocumentRawExtraction, updateDocumentTransactionCount } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { findDuplicateTransaction, bulkUpdateCategories } from '@/lib/db/transactions'
import { extractRawTransactions, classifyTransactions } from '@/lib/claude/extract-transactions'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'
import { readFile } from 'fs/promises'

export async function processDocument(db: Database.Database, documentId: number): Promise<void> {
  const doc = getDocument(db, documentId)
  if (!doc) throw new Error(`Document ${documentId} not found`)

  // Phase 1: Extraction
  updateDocumentPhase(db, documentId, 'extraction')
  let rawResult
  try {
    const pdfBuffer = await readFile(doc.filepath)
    rawResult = await extractRawTransactions(pdfBuffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, documentId, 'failed', `Extraction failed: ${message}`)
    return
  }

  // Store raw extraction data and document type
  updateDocumentRawExtraction(db, documentId, rawResult)
  updateDocumentType(db, documentId, rawResult.document_type)
  updateDocumentTransactionCount(db, documentId, rawResult.transactions.length)

  // Phase 2: Classification
  updateDocumentPhase(db, documentId, 'classification')
  let classifications
  try {
    const classResult = await classifyTransactions(rawResult.document_type, rawResult.transactions)
    classifications = classResult.classifications
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, documentId, 'failed', `Classification failed: ${message}`)
    return
  }

  // Build category map
  const categories = getAllCategories(db)
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
  const otherCategoryId = categoryMap.get('other')!

  // Phase 3: Normalization (non-blocking — failures don't prevent completion)
  updateDocumentPhase(db, documentId, 'normalization')
  let merchantMap = new Map<string, string>()
  try {
    const descriptions = rawResult.transactions.map(t => t.description)
    merchantMap = await normalizeMerchants(descriptions)
  } catch {
    // Normalization failure shouldn't block transaction insertion
  }

  // Insert transactions into DB
  const insert = db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const reclassifyUpdates: Array<{ transactionId: number; categoryId: number }> = []

  const mergeTransaction = db.transaction(() => {
    for (let i = 0; i < rawResult.transactions.length; i++) {
      const t = rawResult.transactions[i]
      const classification = classifications.find(c => c.index === i)
      const categoryId = classification
        ? (categoryMap.get(classification.category.toLowerCase()) ?? otherCategoryId)
        : otherCategoryId

      const existing = findDuplicateTransaction(db, {
        date: t.date, description: t.description, amount: t.amount, type: t.type,
      })

      if (existing) {
        reclassifyUpdates.push({ transactionId: existing.id, categoryId })
      } else {
        const normalizedMerchant = merchantMap.get(t.description) ?? null
        insert.run(documentId, t.date, t.description, t.amount, t.type, categoryId, normalizedMerchant)
      }
    }
  })
  mergeTransaction()

  if (reclassifyUpdates.length > 0) {
    bulkUpdateCategories(db, reclassifyUpdates)
  }

  // Mark complete
  updateDocumentPhase(db, documentId, 'complete')
  updateDocumentStatus(db, documentId, 'completed')
}
