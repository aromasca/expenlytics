import type Database from 'better-sqlite3'
import { getDocument, getDocumentRawExtraction, updateDocumentStatus, updateDocumentPhase, updateDocumentType, updateDocumentRawExtraction, updateDocumentTransactionCount } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { extractRawTransactions, classifyTransactions } from '@/lib/llm/extract-transactions'
import { normalizeMerchants } from '@/lib/llm/normalize-merchants'
import { getProviderForTask } from '@/lib/llm/factory'
import { getMerchantCategoryMap, setMerchantCategory, backfillMerchantCategories, applyMerchantCategories } from '@/lib/db/merchant-categories'
import { createAccount, findAccountByInstitutionAndLastFour, assignDocumentToAccount } from '@/lib/db/accounts'
import { rawExtractionSchema, type RawExtractionResult } from '@/lib/llm/schemas'
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

  const extraction = getProviderForTask(db, 'extraction')
  const classification = getProviderForTask(db, 'classification')
  const normalization = getProviderForTask(db, 'normalization')

  console.log(`[pipeline] Document ${documentId}: "${doc.filename}" — starting`)

  // Phase 1: Extraction — skip if raw extraction already exists (e.g. retrying after classification/normalization failure)
  let rawResult: RawExtractionResult
  const existingRaw = getDocumentRawExtraction(db, documentId)

  if (existingRaw) {
    rawResult = rawExtractionSchema.parse(existingRaw)
    console.log(`[pipeline] Document ${documentId}: extraction skipped — using cached raw data (${rawResult.transactions.length} transactions, ${rawResult.document_type})`)
    console.log(`[pipeline]   classification: ${classification.providerName}/${classification.model}`)
    console.log(`[pipeline]   normalization: ${normalization.providerName}/${normalization.model}`)
  } else {
    console.log(`[pipeline]   extraction: ${extraction.providerName}/${extraction.model}`)
    console.log(`[pipeline]   classification: ${classification.providerName}/${classification.model}`)
    console.log(`[pipeline]   normalization: ${normalization.providerName}/${normalization.model}`)

    updateDocumentPhase(db, documentId, 'extraction')
    try {
      const pdfBuffer = await readFile(doc.filepath)
      console.log(`[pipeline] Document ${documentId}: extraction starting (${(pdfBuffer.length / 1024).toFixed(0)}KB PDF)...`)
      const t0 = Date.now()
      rawResult = await extractRawTransactions(extraction.provider, extraction.providerName, pdfBuffer, extraction.model)
      console.log(`[pipeline] Document ${documentId}: extraction complete — ${rawResult.transactions.length} transactions, ${rawResult.document_type} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[pipeline] Document ${documentId}: extraction FAILED — ${message}`)
      updateDocumentStatus(db, documentId, 'failed', `Extraction failed: ${message}`)
      return
    }

    // Store raw extraction data and document type
    updateDocumentRawExtraction(db, documentId, rawResult)
    updateDocumentType(db, documentId, rawResult.document_type)
    updateDocumentTransactionCount(db, documentId, rawResult.transactions.length)

  }

  // Account detection — match or create account from extraction metadata
  try {
    const raw = rawResult as Record<string, unknown>
    const accountName = raw.account_name as string | undefined
    const institution = raw.institution as string | undefined
    const lastFour = raw.last_four as string | undefined
    const statementMonth = raw.statement_month as string | undefined
    const statementDate = raw.statement_date as string | undefined

    if (institution && lastFour) {
      const existing = findAccountByInstitutionAndLastFour(db, institution, lastFour)
      if (existing) {
        assignDocumentToAccount(db, documentId, existing.id, statementMonth, statementDate)
        console.log(`[pipeline] Document ${documentId}: matched to account "${existing.name}" (id=${existing.id})`)
      } else {
        const name = accountName || `${institution} ·${lastFour}`
        const newId = createAccount(db, { name, institution, lastFour, type: rawResult.document_type })
        assignDocumentToAccount(db, documentId, newId, statementMonth, statementDate)
        console.log(`[pipeline] Document ${documentId}: created new account "${name}" (id=${newId})`)
      }
    } else if (institution) {
      const existing = db.prepare(
        'SELECT * FROM accounts WHERE institution = ? AND type = ? LIMIT 1'
      ).get(institution, rawResult.document_type) as Record<string, unknown> | undefined
      if (existing) {
        assignDocumentToAccount(db, documentId, existing.id as number, statementMonth, statementDate)
        console.log(`[pipeline] Document ${documentId}: matched to account "${existing.name}" by institution+type`)
      } else {
        const name = accountName || institution
        const newId = createAccount(db, { name, institution, lastFour: null, type: rawResult.document_type })
        assignDocumentToAccount(db, documentId, newId, statementMonth, statementDate)
        console.log(`[pipeline] Document ${documentId}: created new account "${name}" (id=${newId})`)
      }
    } else {
      console.log(`[pipeline] Document ${documentId}: no account identity found in extraction`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.warn(`[pipeline] Document ${documentId}: account detection failed (non-blocking) — ${message}`)
  }

  // Build category map
  const categories = getAllCategories(db)
  const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
  const categoryNameMap = new Map(categories.map(c => [c.id, c.name]))
  const otherCategoryId = categoryMap.get('other')!

  // Seed merchant_categories from existing data on first run
  backfillMerchantCategories(db)

  // Phase 2: Normalization (moved before classification)
  updateDocumentPhase(db, documentId, 'normalization')
  let merchantMap = new Map<string, string>()
  try {
    const existingMerchants = db.prepare(
      'SELECT DISTINCT normalized_merchant FROM merchant_categories'
    ).all().map((r) => (r as { normalized_merchant: string }).normalized_merchant)
    const descriptions = rawResult.transactions.map(t => t.description)
    console.log(`[pipeline] Document ${documentId}: normalization starting (${descriptions.length} descriptions, ${existingMerchants.length} known merchants)...`)
    const t1 = Date.now()
    merchantMap = await normalizeMerchants(normalization.provider, normalization.providerName, descriptions, normalization.model, existingMerchants)
    console.log(`[pipeline] Document ${documentId}: normalization complete — ${merchantMap.size} normalized (${((Date.now() - t1) / 1000).toFixed(1)}s)`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn(`[pipeline] Document ${documentId}: normalization failed (non-blocking) — ${message}`)
  }

  // Phase 3: Merchant Lookup + Classification
  updateDocumentPhase(db, documentId, 'classification')
  const knownCategoryMap = getMerchantCategoryMap(db)

  // Split into known (from merchant memory) and unknown (need LLM classification)
  const knownCategories = new Map<number, number>() // index → category_id
  const unknownIndices: number[] = []

  for (let i = 0; i < rawResult.transactions.length; i++) {
    const t = rawResult.transactions[i]
    const normalizedMerchant = merchantMap.get(t.description)
    if (normalizedMerchant) {
      const known = knownCategoryMap.get(normalizedMerchant)
      if (known && known.confidence >= 0.6) {
        knownCategories.set(i, known.category_id)
        continue
      }
    }
    unknownIndices.push(i)
  }

  // Classify only unknown transactions via LLM
  console.log(`[pipeline] Document ${documentId}: classification — ${knownCategories.size} known from memory, ${unknownIndices.length} need LLM`)
  const llmClassifications = new Map<number, string>() // original index → category name
  if (unknownIndices.length > 0) {
    try {
      const unknownTransactions = unknownIndices.map(i => rawResult.transactions[i])

      // Build known mappings for context injection
      const knownMappings: Array<{ merchant: string; category: string }> = []
      for (const [merchant, entry] of knownCategoryMap) {
        const name = categoryNameMap.get(entry.category_id)
        if (name) knownMappings.push({ merchant, category: name })
      }

      console.log(`[pipeline] Document ${documentId}: classification starting (${unknownTransactions.length} transactions, ${knownMappings.length} known mappings for context)...`)
      const t2 = Date.now()
      const classResult = await classifyTransactions(
        classification.provider,
        classification.providerName,
        rawResult.document_type,
        unknownTransactions,
        classification.model,
        knownMappings.length > 0 ? knownMappings : undefined
      )
      console.log(`[pipeline] Document ${documentId}: classification complete — ${classResult.classifications.length} classified (${((Date.now() - t2) / 1000).toFixed(1)}s)`)

      // Remap LLM result indices back to original indices
      for (const c of classResult.classifications) {
        const originalIndex = unknownIndices[c.index]
        if (originalIndex !== undefined) {
          llmClassifications.set(originalIndex, c.category)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[pipeline] Document ${documentId}: classification FAILED — ${message}`)
      updateDocumentStatus(db, documentId, 'failed', `Classification failed: ${message}`)
      return
    }
  } else {
    console.log(`[pipeline] Document ${documentId}: classification skipped — all merchants known`)
  }

  // Phase 4: Insert + Learn
  // Always clear existing transactions before inserting — prevents duplicates if pipeline
  // runs concurrently (e.g., dev server restart re-enqueues a stuck document while original run continues)
  const deleted = db.prepare('DELETE FROM transactions WHERE document_id = ?').run(documentId)
  if (deleted.changes > 0) {
    console.log(`[pipeline] Document ${documentId}: cleared ${deleted.changes} existing transactions before insert`)
  }

  console.log(`[pipeline] Document ${documentId}: inserting ${rawResult.transactions.length} transactions...`)
  const insert = db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant, transaction_class) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )

  const insertAll = db.transaction(() => {
    for (let i = 0; i < rawResult.transactions.length; i++) {
      const t = rawResult.transactions[i]
      const normalizedMerchant = merchantMap.get(t.description) ?? null

      // Determine category: known from memory or LLM-classified
      let categoryId: number
      if (knownCategories.has(i)) {
        categoryId = knownCategories.get(i)!
      } else {
        const llmCategory = llmClassifications.get(i)
        categoryId = llmCategory
          ? (categoryMap.get(llmCategory.toLowerCase()) ?? otherCategoryId)
          : otherCategoryId
      }

      insert.run(documentId, t.date, t.description, t.amount, t.type, categoryId, normalizedMerchant, t.transaction_class ?? null)

      // Learn: update merchant_categories for newly LLM-classified transactions
      if (normalizedMerchant && llmClassifications.has(i)) {
        const existing = knownCategoryMap.get(normalizedMerchant)
        if (!existing) {
          // New merchant — store initial mapping
          setMerchantCategory(db, normalizedMerchant, categoryId, 'auto', 0.6)
        } else if (existing.source !== 'manual') {
          if (existing.category_id === categoryId) {
            // Same category — boost confidence
            const newConfidence = Math.min(existing.confidence + 0.1, 0.95)
            setMerchantCategory(db, normalizedMerchant, categoryId, existing.source, newConfidence)
          }
          // Different category with auto source — leave it (don't flip-flop)
        }
      }
    }
  })
  insertAll()

  // Apply learned categories to all past transactions for consistency
  applyMerchantCategories(db)

  // Mark complete
  updateDocumentPhase(db, documentId, 'complete')
  updateDocumentStatus(db, documentId, 'completed')
  console.log(`[pipeline] Document ${documentId}: COMPLETE ✓`)
}
