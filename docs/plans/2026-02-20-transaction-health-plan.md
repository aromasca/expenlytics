# Transaction Health Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect duplicate and misclassified transactions, exclude them from spending totals, and surface them for review via a "Flagged" toggle on the Transactions page.

**Architecture:** A `transaction_flags` table stores detected issues per transaction. Detection is rule-based (no LLM). The existing `VALID_TRANSACTION_FILTER` is extended to exclude flagged-removed transactions. The Transactions page gets a toggle to show only flagged items with inline resolution actions.

**Tech Stack:** SQLite (better-sqlite3), Next.js API routes, React client components, Vitest

---

### Task 1: Schema — transaction_flags table

**Files:**
- Modify: `src/lib/db/schema.ts:110-383` (add table creation + indexes in `initializeSchema`)

**Step 1: Write the failing test**

Create `src/__tests__/lib/db/transaction-flags.test.ts`:

```typescript
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeSchema } from '@/lib/db/schema'

describe('transaction_flags schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('creates transaction_flags table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transaction_flags'"
    ).all()
    expect(tables).toHaveLength(1)
  })

  it('enforces unique constraint on transaction_id + flag_type', () => {
    const docId = db.prepare(
      "INSERT INTO documents (filename, filepath) VALUES ('test.pdf', '/tmp/test.pdf')"
    ).run().lastInsertRowid

    const txnId = db.prepare(
      "INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, '2025-01-01', 'Acme Corp', 100, 'debit')"
    ).run(docId).lastInsertRowid

    db.prepare(
      "INSERT INTO transaction_flags (transaction_id, flag_type, details) VALUES (?, 'duplicate', '{}')"
    ).run(txnId)

    expect(() => {
      db.prepare(
        "INSERT INTO transaction_flags (transaction_id, flag_type, details) VALUES (?, 'duplicate', '{}')"
      ).run(txnId)
    }).toThrow()
  })

  it('allows different flag types for same transaction', () => {
    const docId = db.prepare(
      "INSERT INTO documents (filename, filepath) VALUES ('test.pdf', '/tmp/test.pdf')"
    ).run().lastInsertRowid

    const txnId = db.prepare(
      "INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, '2025-01-01', 'Acme Corp', 100, 'debit')"
    ).run(docId).lastInsertRowid

    db.prepare(
      "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, 'duplicate')"
    ).run(txnId)
    db.prepare(
      "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, 'category_mismatch')"
    ).run(txnId)

    const flags = db.prepare('SELECT * FROM transaction_flags WHERE transaction_id = ?').all(txnId)
    expect(flags).toHaveLength(2)
  })

  it('cascades delete when transaction is deleted', () => {
    const docId = db.prepare(
      "INSERT INTO documents (filename, filepath) VALUES ('test.pdf', '/tmp/test.pdf')"
    ).run().lastInsertRowid

    const txnId = db.prepare(
      "INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, '2025-01-01', 'Acme Corp', 100, 'debit')"
    ).run(docId).lastInsertRowid

    db.prepare(
      "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, 'duplicate')"
    ).run(txnId)

    db.prepare('DELETE FROM transactions WHERE id = ?').run(txnId)

    const flags = db.prepare('SELECT * FROM transaction_flags').all()
    expect(flags).toHaveLength(0)
  })

  it('validates flag_type values', () => {
    const docId = db.prepare(
      "INSERT INTO documents (filename, filepath) VALUES ('test.pdf', '/tmp/test.pdf')"
    ).run().lastInsertRowid

    const txnId = db.prepare(
      "INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, '2025-01-01', 'Acme Corp', 100, 'debit')"
    ).run(docId).lastInsertRowid

    expect(() => {
      db.prepare(
        "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, 'invalid_type')"
      ).run(txnId)
    }).toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/transaction-flags.test.ts`
Expected: FAIL — "no such table: transaction_flags"

**Step 3: Add schema migration**

In `src/lib/db/schema.ts`, add after the `commitment_overrides` table creation (around line 314):

```typescript
  // Transaction flags table for deduplication & misclassification detection
  db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      flag_type TEXT NOT NULL CHECK (flag_type IN ('duplicate', 'category_mismatch', 'suspicious')),
      details TEXT,
      resolution TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(transaction_id, flag_type)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_transaction_flags_txn ON transaction_flags(transaction_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_transaction_flags_unresolved ON transaction_flags(flag_type) WHERE resolution IS NULL')
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/transaction-flags.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add transaction_flags table schema
```

---

### Task 2: DB module — transaction-flags.ts

**Files:**
- Create: `src/lib/db/transaction-flags.ts`
- Test: `src/__tests__/lib/db/transaction-flags.test.ts` (extend)

**Step 1: Write failing tests**

Add to `src/__tests__/lib/db/transaction-flags.test.ts`:

```typescript
import {
  createFlag,
  resolveFlag,
  getUnresolvedFlags,
  getFlagsForTransaction,
  getUnresolvedFlagCount,
  clearFlagsForDocument,
} from '@/lib/db/transaction-flags'

// Add a helper at the top of the describe block:
function insertDoc(db: Database.Database, filename = 'test.pdf') {
  return Number(db.prepare(
    "INSERT INTO documents (filename, filepath) VALUES (?, '/tmp/test.pdf')"
  ).run(filename).lastInsertRowid)
}

function insertTxn(db: Database.Database, docId: number, overrides: Partial<{ date: string; description: string; amount: number; type: string }> = {}) {
  const { date = '2025-01-01', description = 'Acme Corp', amount = 100, type = 'debit' } = overrides
  return Number(db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type) VALUES (?, ?, ?, ?, ?)'
  ).run(docId, date, description, amount, type).lastInsertRowid)
}

describe('transaction-flags DB module', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('createFlag inserts a flag and returns its id', () => {
    const docId = insertDoc(db)
    const txnId = insertTxn(db, docId)
    const flagId = createFlag(db, txnId, 'duplicate', { duplicate_of_id: 999, duplicate_of_doc: 2 })
    expect(flagId).toBeGreaterThan(0)
  })

  it('createFlag is idempotent (same txn+type returns existing id)', () => {
    const docId = insertDoc(db)
    const txnId = insertTxn(db, docId)
    const id1 = createFlag(db, txnId, 'duplicate', { duplicate_of_id: 999 })
    const id2 = createFlag(db, txnId, 'duplicate', { duplicate_of_id: 999 })
    expect(id1).toBe(id2)
  })

  it('resolveFlag sets resolution and resolved_at', () => {
    const docId = insertDoc(db)
    const txnId = insertTxn(db, docId)
    const flagId = createFlag(db, txnId, 'duplicate')
    resolveFlag(db, flagId, 'removed')
    const flags = getFlagsForTransaction(db, txnId)
    expect(flags[0].resolution).toBe('removed')
    expect(flags[0].resolved_at).toBeTruthy()
  })

  it('getUnresolvedFlags returns only unresolved flags', () => {
    const docId = insertDoc(db)
    const txn1 = insertTxn(db, docId, { description: 'Acme One' })
    const txn2 = insertTxn(db, docId, { description: 'Acme Two' })
    createFlag(db, txn1, 'duplicate')
    const flagId2 = createFlag(db, txn2, 'duplicate')
    resolveFlag(db, flagId2, 'kept')
    const unresolved = getUnresolvedFlags(db)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].transaction_id).toBe(txn1)
  })

  it('getUnresolvedFlagCount returns correct count', () => {
    const docId = insertDoc(db)
    const txn1 = insertTxn(db, docId, { description: 'Acme One' })
    const txn2 = insertTxn(db, docId, { description: 'Acme Two' })
    createFlag(db, txn1, 'duplicate')
    createFlag(db, txn2, 'category_mismatch')
    expect(getUnresolvedFlagCount(db)).toBe(2)
  })

  it('clearFlagsForDocument removes all flags for transactions in a document', () => {
    const doc1 = insertDoc(db, 'a.pdf')
    const doc2 = insertDoc(db, 'b.pdf')
    const txn1 = insertTxn(db, doc1)
    const txn2 = insertTxn(db, doc2, { description: 'Acme Two' })
    createFlag(db, txn1, 'duplicate')
    createFlag(db, txn2, 'duplicate')
    clearFlagsForDocument(db, doc1)
    expect(getUnresolvedFlagCount(db)).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/transaction-flags.test.ts`
Expected: FAIL — cannot resolve module

**Step 3: Implement the module**

Create `src/lib/db/transaction-flags.ts`:

```typescript
import type Database from 'better-sqlite3'

export interface TransactionFlag {
  id: number
  transaction_id: number
  flag_type: 'duplicate' | 'category_mismatch' | 'suspicious'
  details: Record<string, unknown> | null
  resolution: string | null
  resolved_at: string | null
  created_at: string
}

export interface FlagWithTransaction extends TransactionFlag {
  date: string
  description: string
  amount: number
  type: string
  document_id: number
  category_name: string | null
  normalized_merchant: string | null
}

export function createFlag(
  db: Database.Database,
  transactionId: number,
  flagType: 'duplicate' | 'category_mismatch' | 'suspicious',
  details?: Record<string, unknown>
): number {
  const existing = db.prepare(
    'SELECT id FROM transaction_flags WHERE transaction_id = ? AND flag_type = ?'
  ).get(transactionId, flagType) as { id: number } | undefined

  if (existing) return existing.id

  return Number(db.prepare(
    'INSERT INTO transaction_flags (transaction_id, flag_type, details) VALUES (?, ?, ?)'
  ).run(transactionId, flagType, details ? JSON.stringify(details) : null).lastInsertRowid)
}

export function resolveFlag(
  db: Database.Database,
  flagId: number,
  resolution: 'removed' | 'kept' | 'fixed' | 'dismissed'
): void {
  db.prepare(
    "UPDATE transaction_flags SET resolution = ?, resolved_at = datetime('now') WHERE id = ?"
  ).run(resolution, flagId)
}

export function getFlagsForTransaction(db: Database.Database, transactionId: number): TransactionFlag[] {
  const rows = db.prepare(
    'SELECT * FROM transaction_flags WHERE transaction_id = ?'
  ).all(transactionId) as Array<Omit<TransactionFlag, 'details'> & { details: string | null }>

  return rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  }))
}

export function getUnresolvedFlags(db: Database.Database, flagType?: string): FlagWithTransaction[] {
  const typeFilter = flagType ? 'AND tf.flag_type = ?' : ''
  const params = flagType ? [flagType] : []

  const rows = db.prepare(`
    SELECT tf.*, t.date, t.description, t.amount, t.type, t.document_id, t.normalized_merchant,
           c.name as category_name
    FROM transaction_flags tf
    JOIN transactions t ON tf.transaction_id = t.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE tf.resolution IS NULL ${typeFilter}
    ORDER BY t.date DESC
  `).all(params) as Array<Omit<FlagWithTransaction, 'details'> & { details: string | null }>

  return rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  }))
}

export function getUnresolvedFlagCount(db: Database.Database): number {
  return (db.prepare(
    'SELECT COUNT(*) as count FROM transaction_flags WHERE resolution IS NULL'
  ).get() as { count: number }).count
}

export function clearFlagsForDocument(db: Database.Database, documentId: number): void {
  db.prepare(`
    DELETE FROM transaction_flags
    WHERE transaction_id IN (SELECT id FROM transactions WHERE document_id = ?)
  `).run(documentId)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/transaction-flags.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add transaction-flags DB module
```

---

### Task 3: Detection logic — detect-duplicates.ts

**Files:**
- Create: `src/lib/detect-duplicates.ts`
- Create: `src/__tests__/lib/detect-duplicates.test.ts`

**Step 1: Write failing tests**

Create `src/__tests__/lib/detect-duplicates.test.ts`:

```typescript
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeSchema } from '@/lib/db/schema'
import { detectDuplicates, detectCategoryMismatches } from '@/lib/detect-duplicates'
import { getUnresolvedFlags } from '@/lib/db/transaction-flags'

function insertDoc(db: Database.Database, filename = 'test.pdf') {
  return Number(db.prepare(
    "INSERT INTO documents (filename, filepath) VALUES (?, '/tmp/test.pdf')"
  ).run(filename).lastInsertRowid)
}

function insertTxn(db: Database.Database, docId: number, date: string, description: string, amount: number, type: string, categoryName?: string) {
  let categoryId: number | null = null
  if (categoryName) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName) as { id: number } | undefined
    categoryId = cat?.id ?? null
  }
  return Number(db.prepare(
    'INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(docId, date, description, amount, type, categoryId).lastInsertRowid)
}

describe('detectDuplicates', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('flags cross-document duplicates (same date, amount, type)', () => {
    const doc1 = insertDoc(db, 'bank.pdf')
    const doc2 = insertDoc(db, 'card.pdf')
    insertTxn(db, doc1, '2025-01-15', 'Acme Store Purchase', 250, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 250, 'debit')

    const count = detectDuplicates(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
    expect(flags[0].flag_type).toBe('duplicate')
    // The later document (doc2) should be flagged
    expect(flags[0].document_id).toBe(doc2)
  })

  it('does not flag transactions with different amounts', () => {
    const doc1 = insertDoc(db, 'bank.pdf')
    const doc2 = insertDoc(db, 'card.pdf')
    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 250, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store', 251, 'debit')

    const count = detectDuplicates(db)
    expect(count).toBe(0)
  })

  it('does not flag transactions with different types', () => {
    const doc1 = insertDoc(db, 'bank.pdf')
    const doc2 = insertDoc(db, 'card.pdf')
    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 250, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Refund', 250, 'credit')

    const count = detectDuplicates(db)
    expect(count).toBe(0)
  })

  it('flags same-document duplicates (same date, amount, one debit one credit)', () => {
    const doc1 = insertDoc(db, 'combined.pdf')
    insertTxn(db, doc1, '2025-09-06', 'Transfer To Account', 5000, 'debit')
    insertTxn(db, doc1, '2025-09-06', 'Deposit Transfer From Account', 5000, 'credit')

    const count = detectDuplicates(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
    // Credit side should be flagged
    expect(flags[0].type).toBe('credit')
  })

  it('scopes detection to a single document when documentId is provided', () => {
    const doc1 = insertDoc(db, 'bank.pdf')
    const doc2 = insertDoc(db, 'card.pdf')
    const doc3 = insertDoc(db, 'other.pdf')
    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 250, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store Purchase', 250, 'debit')
    insertTxn(db, doc3, '2025-01-15', 'Other Store Purchase', 250, 'debit')

    // Only detect duplicates for doc2 against existing data
    const count = detectDuplicates(db, doc2)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
    expect(flags[0].document_id).toBe(doc2)
  })

  it('does not re-flag already flagged transactions', () => {
    const doc1 = insertDoc(db, 'bank.pdf')
    const doc2 = insertDoc(db, 'card.pdf')
    insertTxn(db, doc1, '2025-01-15', 'Acme Store', 250, 'debit')
    insertTxn(db, doc2, '2025-01-15', 'Acme Store Purchase', 250, 'debit')

    detectDuplicates(db)
    const count2 = detectDuplicates(db)
    expect(count2).toBe(0)

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
  })
})

describe('detectCategoryMismatches', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('flags ATM withdrawals categorized as Salary & Wages', () => {
    const docId = insertDoc(db)
    insertTxn(db, docId, '2025-01-15', 'ATM Withdrawal - First Tech', 500, 'debit', 'Salary & Wages')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db)
    expect(flags[0].flag_type).toBe('category_mismatch')
    const details = flags[0].details as { suggested_category: string }
    expect(details.suggested_category).toBe('ATM Withdrawal')
  })

  it('does not flag ATM withdrawals already in correct category', () => {
    const docId = insertDoc(db)
    insertTxn(db, docId, '2025-01-15', 'ATM Withdrawal - First Tech', 500, 'debit', 'ATM Withdrawal')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(0)
  })

  it('flags checks with non-null category as uncertain', () => {
    const docId = insertDoc(db)
    insertTxn(db, docId, '2025-01-15', 'Check #1029', 15000, 'debit', 'Home Improvement')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(1)

    const flags = getUnresolvedFlags(db)
    const details = flags[0].details as { suggested_category: null; reason: string }
    expect(details.suggested_category).toBeNull()
    expect(details.reason).toContain('Check')
  })

  it('does not flag checks in Other category', () => {
    const docId = insertDoc(db)
    insertTxn(db, docId, '2025-01-15', 'Check #1029', 15000, 'debit', 'Other')

    const count = detectCategoryMismatches(db)
    expect(count).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/detect-duplicates.test.ts`
Expected: FAIL — cannot resolve module

**Step 3: Implement detection logic**

Create `src/lib/detect-duplicates.ts`:

```typescript
import type Database from 'better-sqlite3'
import { createFlag } from '@/lib/db/transaction-flags'

/**
 * Detect duplicate transactions across and within documents.
 * When documentId is provided, only checks transactions in that document against existing data.
 * Returns the number of new flags created.
 */
export function detectDuplicates(db: Database.Database, documentId?: number): number {
  let flagCount = 0

  // 1. Cross-document duplicates: same date + amount + type, different document
  // Flag the transaction from the later-uploaded document (higher document_id)
  const crossDocQuery = documentId
    ? `
      SELECT t2.id as flagged_id, t1.id as canonical_id, t1.document_id as canonical_doc
      FROM transactions t1
      JOIN transactions t2 ON t1.date = t2.date AND t1.amount = t2.amount AND t1.type = t2.type
        AND t1.document_id < t2.document_id
      WHERE t2.document_id = ?
        AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t2.id AND tf.flag_type = 'duplicate')
    `
    : `
      SELECT t2.id as flagged_id, t1.id as canonical_id, t1.document_id as canonical_doc
      FROM transactions t1
      JOIN transactions t2 ON t1.date = t2.date AND t1.amount = t2.amount AND t1.type = t2.type
        AND t1.document_id < t2.document_id
      WHERE NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t2.id AND tf.flag_type = 'duplicate')
    `

  const crossDocParams = documentId ? [documentId] : []
  const crossDocs = db.prepare(crossDocQuery).all(crossDocParams) as Array<{
    flagged_id: number; canonical_id: number; canonical_doc: number
  }>

  for (const row of crossDocs) {
    createFlag(db, row.flagged_id, 'duplicate', {
      duplicate_of_id: row.canonical_id,
      duplicate_of_doc: row.canonical_doc,
    })
    flagCount++
  }

  // 2. Same-document duplicates: same date + amount, one debit one credit (transfer both sides)
  const sameDocQuery = documentId
    ? `
      SELECT t_credit.id as flagged_id, t_debit.id as canonical_id, t_debit.document_id as canonical_doc
      FROM transactions t_debit
      JOIN transactions t_credit ON t_debit.date = t_credit.date AND t_debit.amount = t_credit.amount
        AND t_debit.document_id = t_credit.document_id
        AND t_debit.type = 'debit' AND t_credit.type = 'credit'
        AND t_debit.id != t_credit.id
      WHERE t_debit.document_id = ?
        AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t_credit.id AND tf.flag_type = 'duplicate')
    `
    : `
      SELECT t_credit.id as flagged_id, t_debit.id as canonical_id, t_debit.document_id as canonical_doc
      FROM transactions t_debit
      JOIN transactions t_credit ON t_debit.date = t_credit.date AND t_debit.amount = t_credit.amount
        AND t_debit.document_id = t_credit.document_id
        AND t_debit.type = 'debit' AND t_credit.type = 'credit'
        AND t_debit.id != t_credit.id
      WHERE NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t_credit.id AND tf.flag_type = 'duplicate')
    `

  const sameDocParams = documentId ? [documentId] : []
  const sameDocs = db.prepare(sameDocQuery).all(sameDocParams) as Array<{
    flagged_id: number; canonical_id: number; canonical_doc: number
  }>

  for (const row of sameDocs) {
    createFlag(db, row.flagged_id, 'duplicate', {
      duplicate_of_id: row.canonical_id,
      duplicate_of_doc: row.canonical_doc,
    })
    flagCount++
  }

  return flagCount
}

/**
 * Detect transactions where the description doesn't match the assigned category.
 * Rule-based pattern matching — no LLM calls.
 * Returns the number of new flags created.
 */
export function detectCategoryMismatches(db: Database.Database, documentId?: number): number {
  let flagCount = 0

  const docFilter = documentId ? 'AND t.document_id = ?' : ''
  const docParams = documentId ? [documentId] : []

  // Rule 1: ATM withdrawals not in "ATM Withdrawal" category
  const atmRows = db.prepare(`
    SELECT t.id, c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.description LIKE '%ATM%' AND (t.description LIKE '%Withdrawal%' OR t.description LIKE '%W/D%')
      AND c.name != 'ATM Withdrawal'
      AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch')
      ${docFilter}
  `).all(docParams) as Array<{ id: number; category_name: string }>

  for (const row of atmRows) {
    createFlag(db, row.id, 'category_mismatch', {
      suggested_category: 'ATM Withdrawal',
      reason: `ATM withdrawal categorized as "${row.category_name}"`,
    })
    flagCount++
  }

  // Rule 2: Checks with specific categories (not "Other") — flag as uncertain
  const checkRows = db.prepare(`
    SELECT t.id, c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE (t.description LIKE 'Check #%' OR t.description LIKE 'Check %' AND t.description GLOB 'Check [0-9]*')
      AND c.name IS NOT NULL AND c.name != 'Other'
      AND t.manual_category = 0
      AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t.id AND tf.flag_type = 'category_mismatch')
      ${docFilter}
  `).all(docParams) as Array<{ id: number; category_name: string }>

  for (const row of checkRows) {
    createFlag(db, row.id, 'category_mismatch', {
      suggested_category: null,
      reason: `Check number — category "${row.category_name}" was auto-assigned but may be incorrect`,
    })
    flagCount++
  }

  return flagCount
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/detect-duplicates.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add duplicate and category mismatch detection logic
```

---

### Task 4: Extend VALID_TRANSACTION_FILTER

**Files:**
- Modify: `src/lib/db/filters.ts:7`
- Test: `src/__tests__/lib/db/reports.test.ts` (extend)

**Step 1: Write failing test**

Add to `src/__tests__/lib/db/reports.test.ts` (at the end of the existing describe block):

```typescript
it('excludes flagged-removed transactions from spending summary', () => {
  // Insert a transaction and flag it as removed duplicate
  const txnId = db.prepare(
    "INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, '2025-06-01', 'Duplicate Acme Charge', 500, 'debit', ?)"
  ).run(docId, groceriesId).lastInsertRowid

  db.prepare(
    "INSERT INTO transaction_flags (transaction_id, flag_type, resolution) VALUES (?, 'duplicate', 'removed')"
  ).run(txnId)

  const summary = getSpendingSummary(db, {})
  // The 500 should NOT be included in totalSpent
  // (existing test data total should be unchanged)
  const summaryWithout = getSpendingSummary(db, {})
  expect(summaryWithout.totalSpent).toBe(summary.totalSpent)
})
```

Note: The exact test depends on existing test data in the file. The key assertion is that a flagged-removed transaction is excluded from getSpendingSummary. Read the existing test file to understand the setup, then write a test that adds a flagged txn and asserts it is excluded.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: FAIL — the 500 is still counted

**Step 3: Update the filter**

In `src/lib/db/filters.ts`, change line 7:

```typescript
export const VALID_TRANSACTION_FILTER = "COALESCE(c.exclude_from_totals, 0) = 0 AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest')) AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t.id AND tf.resolution = 'removed')"
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: PASS

Also run full test suite to make sure nothing else broke:

Run: `npm test`
Expected: All PASS

**Step 5: Commit**

```
feat: exclude flagged-removed transactions from spending queries
```

---

### Task 5: Pipeline integration — detect after insert

**Files:**
- Modify: `src/lib/pipeline.ts:263-271` (add detection call after insert)

**Step 1: Write failing test**

Add to `src/__tests__/lib/pipeline.test.ts` or create a new test. The test should verify that after `processDocument` completes, duplicate flags exist for cross-document matches. Since pipeline tests involve mocking the LLM, follow the existing mock patterns in `pipeline.test.ts`.

The minimal integration: verify that `detectDuplicates` is called after transaction insertion. Since `pipeline.ts` is complex with mocking, the simplest approach is:

Add to `src/__tests__/lib/pipeline.test.ts`:

```typescript
// At the top, add import:
import { getUnresolvedFlagCount } from '@/lib/db/transaction-flags'

// In the describe block, add:
it('runs duplicate detection after inserting transactions', async () => {
  // Insert a pre-existing transaction that will match
  db.prepare(
    "INSERT INTO documents (id, filename, filepath, status) VALUES (99, 'old.pdf', '/tmp/old.pdf', 'completed')"
  ).run()
  db.prepare(
    "INSERT INTO transactions (document_id, date, description, amount, type) VALUES (99, '2025-01-15', 'Acme Store', 100, 'debit')"
  ).run()

  // Set up mock to return a matching transaction
  mockComplete.mockResolvedValueOnce({ /* extraction result with matching txn */ })
  // ... (follow existing test patterns for mocking)

  await processDocument(db, docId)

  const flagCount = getUnresolvedFlagCount(db)
  expect(flagCount).toBeGreaterThan(0)
})
```

Note: This test needs to follow the exact mock patterns already in `pipeline.test.ts`. Read the file for setup details. The key assertion is that after pipeline completes, flags exist.

**Step 2: Implement pipeline integration**

In `src/lib/pipeline.ts`, add import at top:

```typescript
import { detectDuplicates, detectCategoryMismatches } from '@/lib/detect-duplicates'
import { clearFlagsForDocument } from '@/lib/db/transaction-flags'
```

Before the `DELETE FROM transactions` line (line 218), add:

```typescript
  // Clear existing flags for this document before re-inserting
  clearFlagsForDocument(db, documentId)
```

After `applyMerchantCategories(db)` (line 266), add:

```typescript
  // Detect duplicate and misclassified transactions
  try {
    const dupCount = detectDuplicates(db, documentId)
    const mismatchCount = detectCategoryMismatches(db, documentId)
    if (dupCount > 0 || mismatchCount > 0) {
      console.log(`[pipeline] Document ${documentId}: flagged ${dupCount} duplicates, ${mismatchCount} mismatches`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.warn(`[pipeline] Document ${documentId}: flag detection failed (non-blocking) — ${message}`)
  }
```

**Step 3: Run tests**

Run: `npm test -- src/__tests__/lib/pipeline.test.ts`
Expected: PASS

**Step 4: Commit**

```
feat: run duplicate detection in pipeline after transaction insert
```

---

### Task 6: API endpoints — resolve flags and backfill

**Files:**
- Create: `src/app/api/transactions/flags/resolve/route.ts`
- Create: `src/app/api/transactions/detect-duplicates/route.ts`
- Modify: `src/app/api/transactions/route.ts:10-63` (extend GET to support flagged filter)

**Step 1: Create resolve endpoint**

Create `src/app/api/transactions/flags/resolve/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { resolveFlag } from '@/lib/db/transaction-flags'
import { updateTransactionCategory } from '@/lib/db/transactions'

const VALID_RESOLUTIONS = ['removed', 'kept', 'fixed', 'dismissed'] as const

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { flagId, resolution, categoryId } = body

  if (typeof flagId !== 'number') {
    return NextResponse.json({ error: 'flagId must be a number' }, { status: 400 })
  }

  if (!(VALID_RESOLUTIONS as readonly string[]).includes(resolution)) {
    return NextResponse.json({ error: `resolution must be one of: ${VALID_RESOLUTIONS.join(', ')}` }, { status: 400 })
  }

  const db = getDb()

  // For 'fixed' resolution with categoryId, also update the transaction category
  if (resolution === 'fixed' && typeof categoryId === 'number') {
    const flag = db.prepare('SELECT transaction_id FROM transaction_flags WHERE id = ?').get(flagId) as { transaction_id: number } | undefined
    if (flag) {
      updateTransactionCategory(db, flag.transaction_id, categoryId, true)
    }
  }

  resolveFlag(db, flagId, resolution)
  return NextResponse.json({ success: true })
}
```

**Step 2: Create detect-duplicates backfill endpoint**

Create `src/app/api/transactions/detect-duplicates/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectDuplicates, detectCategoryMismatches } from '@/lib/detect-duplicates'

export async function POST() {
  const db = getDb()
  const duplicates = detectDuplicates(db)
  const mismatches = detectCategoryMismatches(db)
  return NextResponse.json({ duplicates, mismatches, total: duplicates + mismatches })
}
```

**Step 3: Extend GET /api/transactions for flagged filter**

In `src/app/api/transactions/route.ts`, add to the GET handler (after the `idsParam` check, around line 24):

```typescript
  // Flagged transactions mode
  const flaggedParam = params.get('flagged')
  if (flaggedParam === 'true') {
    const flags = await import('@/lib/db/transaction-flags').then(m => m.getUnresolvedFlags(db))
    return NextResponse.json({ transactions: flags, total: flags.length })
  }

  // Flag count (for badge)
  const countParam = params.get('flag_count')
  if (countParam === 'true') {
    const count = await import('@/lib/db/transaction-flags').then(m => m.getUnresolvedFlagCount(db))
    return NextResponse.json({ count })
  }
```

**Step 4: Run linter**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```
feat: add flag resolution and duplicate detection API endpoints
```

---

### Task 7: UI — Flagged toggle on Transactions page

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx` (add Flagged tab)
- Modify: `src/components/transaction-table.tsx` (add flag rendering + resolution actions)

**Step 1: Add flagged toggle to transactions page**

In `src/app/(app)/transactions/page.tsx`, update `TransactionsContent`:

```typescript
import { Badge } from '@/components/ui/badge'

function TransactionsContent() {
  const searchParams = useSearchParams()
  const [showFlagged, setShowFlagged] = useState(false)
  const [flagCount, setFlagCount] = useState(0)

  const [filters, setFilters] = useState<Filters>(() => {
    const initial = { ...EMPTY_FILTERS }
    const search = searchParams.get('search')
    if (search) initial.search = search
    const categoryId = searchParams.get('category_id')
    if (categoryId) initial.category_ids = [Number(categoryId)]
    return initial
  })

  // Fetch flag count
  useEffect(() => {
    fetch('/api/transactions?flag_count=true')
      .then(r => r.json())
      .then(data => setFlagCount(data.count))
      .catch(() => {})
  }, [showFlagged])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <div className="flex gap-1">
            <Button
              variant={showFlagged ? 'ghost' : 'default'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowFlagged(false)}
            >
              All
            </Button>
            <Button
              variant={showFlagged ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowFlagged(true)}
            >
              Flagged
              {flagCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 text-[10px] px-1">{flagCount}</Badge>
              )}
            </Button>
          </div>
        </div>
        <Button variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => exportCsv(filters)}>
          <Download className="h-3.5 w-3.5 mr-1" />
          Export CSV
        </Button>
      </div>
      {!showFlagged && <FilterBar filters={filters} onFiltersChange={setFilters} />}
      <div data-walkthrough="transactions">
        {showFlagged ? (
          <FlaggedTransactions onResolve={() => setFlagCount(c => Math.max(0, c - 1))} />
        ) : (
          <TransactionTable filters={filters} />
        )}
      </div>
    </div>
  )
}
```

**Step 2: Create FlaggedTransactions component**

Create `src/components/flagged-transactions.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CategorySelect } from './category-select'
import { formatCurrencyPrecise } from '@/lib/format'
import { AlertTriangle, Copy, Tag } from 'lucide-react'

interface FlaggedTransaction {
  id: number
  transaction_id: number
  flag_type: 'duplicate' | 'category_mismatch' | 'suspicious'
  details: Record<string, unknown> | null
  date: string
  description: string
  amount: number
  type: string
  document_id: number
  category_name: string | null
  normalized_merchant: string | null
}

interface Category {
  id: number
  name: string
  color: string
}

interface FlaggedTransactionsProps {
  onResolve?: () => void
}

export function FlaggedTransactions({ onResolve }: FlaggedTransactionsProps) {
  const [flags, setFlags] = useState<FlaggedTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFlags = useCallback(() => {
    setLoading(true)
    fetch('/api/transactions?flagged=true')
      .then(r => r.json())
      .then(data => {
        setFlags(data.transactions)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchFlags()
    fetch('/api/categories').then(r => r.json()).then(setCategories).catch(() => {})
  }, [fetchFlags])

  const resolve = (flagId: number, resolution: string, categoryId?: number) => {
    // Optimistic removal
    setFlags(prev => prev.filter(f => f.id !== flagId))
    onResolve?.()

    fetch('/api/transactions/flags/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagId, resolution, categoryId }),
    }).catch(() => {
      // Revert on error
      fetchFlags()
    })
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-6 text-center">Loading flagged transactions...</div>
  }

  if (flags.length === 0) {
    return <div className="text-xs text-muted-foreground py-6 text-center">No flagged transactions. Looking good!</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="py-2 text-xs">Date</TableHead>
          <TableHead className="py-2 text-xs">Description</TableHead>
          <TableHead className="py-2 text-xs text-right">Amount</TableHead>
          <TableHead className="py-2 text-xs">Issue</TableHead>
          <TableHead className="py-2 text-xs">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flags.map((flag) => (
          <TableRow key={flag.id}>
            <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{flag.date}</TableCell>
            <TableCell className="py-1.5 text-xs">{flag.description}</TableCell>
            <TableCell className={`py-1.5 text-xs text-right tabular-nums font-medium ${flag.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
              {flag.type === 'credit' ? '+' : '-'}{formatCurrencyPrecise(flag.amount)}
            </TableCell>
            <TableCell className="py-1.5">
              {flag.flag_type === 'duplicate' && (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Copy className="h-2.5 w-2.5" />
                    Duplicate
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    of doc #{(flag.details as Record<string, number>)?.duplicate_of_doc}
                  </span>
                </div>
              )}
              {flag.flag_type === 'category_mismatch' && (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Tag className="h-2.5 w-2.5" />
                    Category
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {(flag.details as Record<string, string>)?.reason}
                  </span>
                </div>
              )}
              {flag.flag_type === 'suspicious' && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Suspicious
                </Badge>
              )}
            </TableCell>
            <TableCell className="py-1.5">
              <div className="flex items-center gap-1">
                {flag.flag_type === 'duplicate' && (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive" onClick={() => resolve(flag.id, 'removed')}>
                      Remove
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => resolve(flag.id, 'kept')}>
                      Keep
                    </Button>
                  </>
                )}
                {flag.flag_type === 'category_mismatch' && (
                  <>
                    {(flag.details as Record<string, string>)?.suggested_category && (
                      <Button
                        variant="ghost" size="sm" className="h-6 text-[11px] text-emerald-600 dark:text-emerald-400"
                        onClick={() => {
                          const suggestedName = (flag.details as Record<string, string>).suggested_category
                          const cat = categories.find(c => c.name === suggestedName)
                          if (cat) resolve(flag.id, 'fixed', cat.id)
                        }}
                      >
                        Fix to: {(flag.details as Record<string, string>).suggested_category}
                      </Button>
                    )}
                    {!(flag.details as Record<string, string>)?.suggested_category && (
                      <CategorySelect
                        categories={categories}
                        value={null}
                        placeholder="Set category..."
                        onValueChange={(catId) => resolve(flag.id, 'fixed', catId)}
                      />
                    )}
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={() => resolve(flag.id, 'dismissed')}>
                  Dismiss
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

**Step 3: Run linter and dev server**

Run: `npm run lint`
Run: `npm run dev` (manual verification)

**Step 4: Commit**

```
feat: add flagged transactions UI with inline resolution actions
```

---

### Task 8: Run backfill on existing data

This is a one-time operational step, not code. After deploying the above:

**Step 1: Restart dev server** (to apply schema migration)

Run: `npm run dev`

**Step 2: Run backfill via API**

```bash
curl -X POST http://localhost:3000/api/transactions/detect-duplicates
```

Expected: Returns `{ "duplicates": N, "mismatches": M, "total": N+M }`

**Step 3: Verify in UI**

Open `http://localhost:3000/transactions`, click "Flagged" toggle. Review the detected issues.

**Step 4: Commit** (no code changes, just verification)

---

### Task 9: Run full test suite and lint

**Step 1: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 3: Fix any failures, then commit**

```
chore: fix test/lint issues from transaction health feature
```

---

## Task Dependency Graph

```
Task 1 (schema) → Task 2 (DB module) → Task 3 (detection logic) → Task 4 (filter) → Task 5 (pipeline)
                                                                                    → Task 6 (API)
                                                                                    → Task 7 (UI)
                                                                                      Task 8 (backfill)
                                                                                      Task 9 (verify)
```

Tasks 5, 6, and 7 can run in parallel after Task 4. Task 8 requires all prior tasks. Task 9 is final.
