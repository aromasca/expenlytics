import type Database from 'better-sqlite3'
import { createFlag } from '@/lib/db/transaction-flags'

/**
 * Detect duplicate transactions and create flags.
 * When documentId is provided, only checks transactions in that document.
 * Returns number of new flags created.
 */
export function detectDuplicates(db: Database.Database, documentId?: number): number {
  let flagsCreated = 0

  // --- Cross-document duplicates ---
  // Match: same date + amount + type, different document_id
  // Flag the transaction from the later-uploaded document (higher document_id)
  const crossDocQuery = documentId
    ? `
      SELECT t1.id as flagged_id, t2.id as original_id, t2.document_id as original_doc_id
      FROM transactions t1
      JOIN transactions t2
        ON t1.date = t2.date
        AND t1.amount = t2.amount
        AND t1.type = t2.type
        AND t1.document_id != t2.document_id
        AND t1.document_id > t2.document_id
      WHERE t1.document_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = t1.id AND tf.flag_type = 'duplicate'
        )
    `
    : `
      SELECT t1.id as flagged_id, t2.id as original_id, t2.document_id as original_doc_id
      FROM transactions t1
      JOIN transactions t2
        ON t1.date = t2.date
        AND t1.amount = t2.amount
        AND t1.type = t2.type
        AND t1.document_id != t2.document_id
        AND t1.document_id > t2.document_id
      WHERE NOT EXISTS (
        SELECT 1 FROM transaction_flags tf
        WHERE tf.transaction_id = t1.id AND tf.flag_type = 'duplicate'
      )
    `

  const crossDocParams = documentId ? [documentId] : []
  const crossDocResults = db.prepare(crossDocQuery).all(crossDocParams) as Array<{
    flagged_id: number
    original_id: number
    original_doc_id: number
  }>

  for (const row of crossDocResults) {
    createFlag(db, row.flagged_id, 'duplicate', {
      duplicate_of_id: row.original_id,
      duplicate_of_doc: row.original_doc_id,
    })
    flagsCreated++
  }

  // --- Same-document duplicates ---
  // Match: same date + amount within one document, one debit + one credit
  // Flag the credit side
  const sameDocQuery = documentId
    ? `
      SELECT credit.id as flagged_id, debit.id as original_id, debit.document_id as original_doc_id
      FROM transactions credit
      JOIN transactions debit
        ON credit.date = debit.date
        AND credit.amount = debit.amount
        AND credit.document_id = debit.document_id
        AND credit.type = 'credit'
        AND debit.type = 'debit'
        AND credit.id != debit.id
      WHERE credit.document_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = credit.id AND tf.flag_type = 'duplicate'
        )
    `
    : `
      SELECT credit.id as flagged_id, debit.id as original_id, debit.document_id as original_doc_id
      FROM transactions credit
      JOIN transactions debit
        ON credit.date = debit.date
        AND credit.amount = debit.amount
        AND credit.document_id = debit.document_id
        AND credit.type = 'credit'
        AND debit.type = 'debit'
        AND credit.id != debit.id
      WHERE NOT EXISTS (
        SELECT 1 FROM transaction_flags tf
        WHERE tf.transaction_id = credit.id AND tf.flag_type = 'duplicate'
      )
    `

  const sameDocParams = documentId ? [documentId] : []
  const sameDocResults = db.prepare(sameDocQuery).all(sameDocParams) as Array<{
    flagged_id: number
    original_id: number
    original_doc_id: number
  }>

  for (const row of sameDocResults) {
    createFlag(db, row.flagged_id, 'duplicate', {
      duplicate_of_id: row.original_id,
      duplicate_of_doc: row.original_doc_id,
    })
    flagsCreated++
  }

  return flagsCreated
}

/**
 * Rule-based category mismatch detection.
 * When documentId is provided, only checks transactions in that document.
 * Returns number of new flags created.
 */
export function detectCategoryMismatches(db: Database.Database, documentId?: number): number {
  let flagsCreated = 0

  // Rule 1: ATM withdrawals not categorized as "ATM Withdrawal"
  const atmQuery = documentId
    ? `
      SELECT t.id
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.document_id = ?
        AND t.description LIKE '%ATM%'
        AND (t.description LIKE '%Withdrawal%' OR t.description LIKE '%W/D%')
        AND (t.category_id IS NULL OR c.name != 'ATM Withdrawal')
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch'
        )
    `
    : `
      SELECT t.id
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.description LIKE '%ATM%'
        AND (t.description LIKE '%Withdrawal%' OR t.description LIKE '%W/D%')
        AND (t.category_id IS NULL OR c.name != 'ATM Withdrawal')
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch'
        )
    `

  const atmParams = documentId ? [documentId] : []
  const atmResults = db.prepare(atmQuery).all(atmParams) as Array<{ id: number }>

  for (const row of atmResults) {
    createFlag(db, row.id, 'category_mismatch', {
      suggested_category: 'ATM Withdrawal',
      reason: 'ATM withdrawal not categorized as ATM Withdrawal',
    })
    flagsCreated++
  }

  // Rule 2: Checks with non-"Other" category and manual_category = 0
  // Match "Check #NNN" or "Check NNN" patterns
  const checkQuery = documentId
    ? `
      SELECT t.id
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.document_id = ?
        AND (t.description LIKE 'Check #%' OR t.description GLOB 'Check [0-9]*')
        AND t.manual_category = 0
        AND c.name IS NOT NULL
        AND c.name != 'Other'
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch'
        )
    `
    : `
      SELECT t.id
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE (t.description LIKE 'Check #%' OR t.description GLOB 'Check [0-9]*')
        AND t.manual_category = 0
        AND c.name IS NOT NULL
        AND c.name != 'Other'
        AND NOT EXISTS (
          SELECT 1 FROM transaction_flags tf
          WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch'
        )
    `

  const checkParams = documentId ? [documentId] : []
  const checkResults = db.prepare(checkQuery).all(checkParams) as Array<{ id: number }>

  for (const row of checkResults) {
    createFlag(db, row.id, 'category_mismatch', {
      suggested_category: null,
      reason: 'Check number — category may be incorrect',
    })
    flagsCreated++
  }

  return flagsCreated
}
