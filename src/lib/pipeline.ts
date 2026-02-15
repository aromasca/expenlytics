import type Database from 'better-sqlite3'
import { getDocument, updateDocumentStatus, updateDocumentPhase, updateDocumentType, updateDocumentRawExtraction, updateDocumentTransactionCount } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { extractRawTransactions, classifyTransactions } from '@/lib/claude/extract-transactions'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'
import { getModelForTask } from '@/lib/claude/models'
import { readFile } from 'fs/promises'

// Sequential processing queue — only one document processes at a time
type QueueItem = { task: () => Promise<void>; resolve: () => void; reject: (err: unknown) => void }
const queue: QueueItem[] = []
let processing = false

async function processQueue() {
  if (processing) return
  processing = true
  while (queue.length > 0) {
    const item = queue.shift()!
    try {
      await item.task()
      item.resolve()
    } catch (err) {
      item.reject(err)
    }
  }
  processing = false
}

export function enqueueDocument(task: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    queue.push({ task, resolve, reject })
    processQueue()
  })
}

export async function processDocument(db: Database.Database, documentId: number): Promise<void> {
  const doc = getDocument(db, documentId)
  if (!doc) throw new Error(`Document ${documentId} not found`)

  const extractionModel = getModelForTask(db, 'extraction')
  const classificationModel = getModelForTask(db, 'classification')
  const normalizationModel = getModelForTask(db, 'normalization')

  // Phase 1: Extraction
  updateDocumentPhase(db, documentId, 'extraction')
  let rawResult
  try {
    const pdfBuffer = await readFile(doc.filepath)
    rawResult = await extractRawTransactions(pdfBuffer, extractionModel)
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
    const classResult = await classifyTransactions(rawResult.document_type, rawResult.transactions, classificationModel)
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
    merchantMap = await normalizeMerchants(descriptions, normalizationModel)
  } catch {
    // Normalization failure shouldn't block transaction insertion
  }

  // Insert transactions into DB
  const insert = db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant, transaction_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const insertAll = db.transaction(() => {
    for (let i = 0; i < rawResult.transactions.length; i++) {
      const t = rawResult.transactions[i]
      const classification = classifications.find(c => c.index === i)
      const categoryId = classification
        ? (categoryMap.get(classification.category.toLowerCase()) ?? otherCategoryId)
        : otherCategoryId

      const normalizedMerchant = merchantMap.get(t.description) ?? null
      insert.run(documentId, t.date, t.description, t.amount, t.type, categoryId, normalizedMerchant, t.transaction_class ?? null)
    }
  })
  insertAll()

  // Mark complete
  updateDocumentPhase(db, documentId, 'complete')
  updateDocumentStatus(db, documentId, 'completed')
}
