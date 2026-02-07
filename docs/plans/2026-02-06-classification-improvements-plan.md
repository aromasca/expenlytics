# Classification Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve transaction classification with document-type-aware prompting, expanded categories (26), SHA-256 file dedup with reclassification, and manual override preservation.

**Architecture:** The LLM prompt is restructured to detect document type and apply context-aware categorization. File uploads are deduped by SHA-256 hash — same file triggers reclassify-only, new file triggers extract-and-merge. Manual category overrides are tracked with a flag and preserved during reclassification.

**Tech Stack:** Next.js 16, better-sqlite3, Anthropic SDK, Zod v4, Vitest

**Working directory:** `/Users/aromasca/workspace/expenlytics/.worktrees/classification-improvements`

**Design doc:** `docs/plans/2026-02-06-classification-improvements-design.md`

---

### Task 1: Expand categories in schema and seed data

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/claude/schemas.ts`
- Test: `src/__tests__/lib/db/categories.test.ts`
- Test: `src/__tests__/lib/claude/schemas.test.ts`

**Step 1: Update `SEED_CATEGORIES` in `src/lib/db/schema.ts`**

Replace the existing `SEED_CATEGORIES` array with:

```typescript
const SEED_CATEGORIES = [
  { name: 'Groceries', color: '#22C55E' },
  { name: 'Restaurants & Dining', color: '#F97316' },
  { name: 'Gas & Fuel', color: '#A855F7' },
  { name: 'Public Transit', color: '#3B82F6' },
  { name: 'Rideshare & Taxi', color: '#6366F1' },
  { name: 'Parking & Tolls', color: '#64748B' },
  { name: 'Rent & Mortgage', color: '#8B5CF6' },
  { name: 'Home Maintenance', color: '#D946EF' },
  { name: 'Utilities', color: '#EAB308' },
  { name: 'Subscriptions', color: '#0EA5E9' },
  { name: 'Shopping', color: '#14B8A6' },
  { name: 'Electronics', color: '#2563EB' },
  { name: 'Health & Medical', color: '#EF4444' },
  { name: 'Fitness', color: '#F43F5E' },
  { name: 'Insurance', color: '#BE185D' },
  { name: 'Childcare & Education', color: '#7C3AED' },
  { name: 'Pets', color: '#EA580C' },
  { name: 'Travel', color: '#0891B2' },
  { name: 'Entertainment', color: '#EC4899' },
  { name: 'Gifts & Donations', color: '#E11D48' },
  { name: 'Personal Care', color: '#F472B6' },
  { name: 'Income', color: '#10B981' },
  { name: 'Transfer', color: '#6B7280' },
  { name: 'Refund', color: '#059669' },
  { name: 'Fees & Charges', color: '#DC2626' },
  { name: 'Other', color: '#9CA3AF' },
]
```

**Step 2: Update `VALID_CATEGORIES` in `src/lib/claude/schemas.ts`**

Replace the existing `VALID_CATEGORIES` array to match the 26 new category names:

```typescript
export const VALID_CATEGORIES = [
  'Groceries', 'Restaurants & Dining', 'Gas & Fuel', 'Public Transit',
  'Rideshare & Taxi', 'Parking & Tolls', 'Rent & Mortgage', 'Home Maintenance',
  'Utilities', 'Subscriptions', 'Shopping', 'Electronics', 'Health & Medical',
  'Fitness', 'Insurance', 'Childcare & Education', 'Pets', 'Travel',
  'Entertainment', 'Gifts & Donations', 'Personal Care', 'Income', 'Transfer',
  'Refund', 'Fees & Charges', 'Other',
] as const
```

**Step 3: Update tests**

In `src/__tests__/lib/db/categories.test.ts`, update the seed count check:

```typescript
it('seeds default categories', () => {
  const categories = getAllCategories(db)
  expect(categories).toHaveLength(26)
  expect(categories.map(c => c.name)).toContain('Groceries')
  expect(categories.map(c => c.name)).toContain('Restaurants & Dining')
  expect(categories.map(c => c.name)).toContain('Subscriptions')
})
```

In `src/__tests__/lib/claude/schemas.test.ts`, update the test that references old category names to use new ones (e.g., 'Health' → 'Health & Medical', 'Dining' → 'Restaurants & Dining'):

```typescript
it('validates correct extraction output with category', () => {
  const valid = {
    transactions: [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries' },
      { date: '2025-01-16', description: 'Employer Inc', amount: 3000, type: 'credit', category: 'Income' },
    ],
  }
  expect(extractionSchema.parse(valid)).toEqual(valid)
})
```

(This test happens to still be valid — `Groceries` and `Income` are still in the new list. Verify the `'Health'` test uses `'Health & Medical'`):

```typescript
it('accepts any category string (LLM decides)', () => {
  const valid = {
    transactions: [
      { date: '2025-01-15', description: 'Dentist', amount: 200, type: 'debit', category: 'Health & Medical' },
    ],
  }
  expect(extractionSchema.parse(valid).transactions[0].category).toBe('Health & Medical')
})
```

**Step 4: Run tests**

Run: `npm test`
Expected: All 15 tests pass

**Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/claude/schemas.ts src/__tests__/lib/db/categories.test.ts src/__tests__/lib/claude/schemas.test.ts
git commit -m "feat: expand categories from 11 to 26 (Mint/YNAB-style)"
```

---

### Task 2: Add document type and file hash to schema + documents module

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/documents.ts`
- Test: `src/__tests__/lib/db/documents.test.ts`

**Step 1: Write failing tests in `src/__tests__/lib/db/documents.test.ts`**

Add these tests to the existing describe block:

```typescript
it('creates document with file hash', () => {
  const id = createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'abc123hash')
  const doc = getDocument(db, id)
  expect(doc!.file_hash).toBe('abc123hash')
})

it('finds document by file hash', () => {
  createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'sha256hashvalue')
  const doc = findDocumentByHash(db, 'sha256hashvalue')
  expect(doc).toBeDefined()
  expect(doc!.filename).toBe('statement.pdf')
})

it('returns undefined for unknown hash', () => {
  const doc = findDocumentByHash(db, 'nonexistent')
  expect(doc).toBeUndefined()
})

it('stores and retrieves document type', () => {
  const id = createDocument(db, 'cc.pdf', '/data/uploads/cc.pdf', 'hash123')
  updateDocumentType(db, id, 'credit_card')
  const doc = getDocument(db, id)
  expect(doc!.document_type).toBe('credit_card')
})
```

Update the import to include the new functions:

```typescript
import { createDocument, getDocument, updateDocumentStatus, findDocumentByHash, updateDocumentType } from '@/lib/db/documents'
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: FAIL — `findDocumentByHash` and `updateDocumentType` not exported, `createDocument` signature mismatch

**Step 3: Update schema in `src/lib/db/schema.ts`**

Add the new columns to the `documents` CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  file_hash TEXT NOT NULL DEFAULT '',
  document_type TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT
);
```

Add an index after the existing indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
```

**Step 4: Update `src/lib/db/documents.ts`**

Update the `Document` interface:

```typescript
export interface Document {
  id: number
  filename: string
  filepath: string
  file_hash: string
  document_type: string | null
  uploaded_at: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
}
```

Update `createDocument` to accept `fileHash`:

```typescript
export function createDocument(db: Database.Database, filename: string, filepath: string, fileHash: string = ''): number {
  const result = db.prepare('INSERT INTO documents (filename, filepath, file_hash) VALUES (?, ?, ?)').run(filename, filepath, fileHash)
  return result.lastInsertRowid as number
}
```

Add new functions:

```typescript
export function findDocumentByHash(db: Database.Database, fileHash: string): Document | undefined {
  return db.prepare('SELECT * FROM documents WHERE file_hash = ?').get(fileHash) as Document | undefined
}

export function updateDocumentType(db: Database.Database, id: number, documentType: string): void {
  db.prepare('UPDATE documents SET document_type = ? WHERE id = ?').run(documentType, id)
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass (existing tests still work because `fileHash` defaults to `''`)

**Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/documents.ts src/__tests__/lib/db/documents.test.ts
git commit -m "feat: add file_hash and document_type to documents table"
```

---

### Task 3: Add manual_category flag to transactions

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/transactions.ts`
- Modify: `src/app/api/transactions/[id]/route.ts`
- Test: `src/__tests__/lib/db/transactions.test.ts`

**Step 1: Write failing tests in `src/__tests__/lib/db/transactions.test.ts`**

Add these tests to the existing describe block:

```typescript
it('sets manual_category flag when updating category', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])
  const categories = getAllCategories(db)
  const groceries = categories.find(c => c.name === 'Groceries')!
  const txns = listTransactions(db, {})
  updateTransactionCategory(db, txns.transactions[0].id, groceries.id, true)

  const updated = listTransactions(db, {})
  expect(updated.transactions[0].manual_category).toBe(1)
})

it('manual_category defaults to 0', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])
  const txns = listTransactions(db, {})
  expect(txns.transactions[0].manual_category).toBe(0)
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: FAIL — `manual_category` not in result, `updateTransactionCategory` signature mismatch

**Step 3: Update schema in `src/lib/db/schema.ts`**

Add `manual_category` to the transactions CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  manual_category INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 4: Update `src/lib/db/transactions.ts`**

Add `manual_category` to the `TransactionRow` interface:

```typescript
export interface TransactionRow {
  id: number
  document_id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
  manual_category: number
  created_at: string
}
```

Update `updateTransactionCategory` to accept and set the manual flag:

```typescript
export function updateTransactionCategory(db: Database.Database, transactionId: number, categoryId: number, manual: boolean = false): void {
  db.prepare('UPDATE transactions SET category_id = ?, manual_category = ? WHERE id = ?').run(categoryId, manual ? 1 : 0, transactionId)
}
```

**Step 5: Update `src/app/api/transactions/[id]/route.ts`**

Pass `manual: true` when the user updates a category via the API:

```typescript
updateTransactionCategory(db, Number(id), category_id, true)
```

**Step 6: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/transactions.ts src/app/api/transactions/[id]/route.ts src/__tests__/lib/db/transactions.test.ts
git commit -m "feat: add manual_category flag to transactions"
```

---

### Task 4: Add duplicate detection and bulk category update to transactions module

**Files:**
- Modify: `src/lib/db/transactions.ts`
- Test: `src/__tests__/lib/db/transactions.test.ts`

**Step 1: Write failing tests in `src/__tests__/lib/db/transactions.test.ts`**

Add imports for new functions and add tests:

```typescript
import { insertTransactions, listTransactions, updateTransactionCategory, findDuplicateTransaction, bulkUpdateCategories } from '@/lib/db/transactions'
```

```typescript
it('finds duplicate transaction by date+description+amount+type', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
  ])
  const dup = findDuplicateTransaction(db, { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' })
  expect(dup).toBeDefined()
  expect(dup!.description).toBe('Whole Foods')
})

it('returns undefined when no duplicate exists', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
  ])
  const dup = findDuplicateTransaction(db, { date: '2025-01-16', description: 'Whole Foods', amount: 85.50, type: 'debit' })
  expect(dup).toBeUndefined()
})

it('bulk updates categories respecting manual flag', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store A', amount: 50, type: 'debit' },
    { date: '2025-01-16', description: 'Store B', amount: 30, type: 'debit' },
  ])
  const categories = getAllCategories(db)
  const groceries = categories.find(c => c.name === 'Groceries')!
  const shopping = categories.find(c => c.name === 'Shopping')!

  // Manually override Store A
  const txns = listTransactions(db, {})
  const storeA = txns.transactions.find(t => t.description === 'Store A')!
  updateTransactionCategory(db, storeA.id, groceries.id, true)

  // Bulk update both — Store A should not change
  const storeB = txns.transactions.find(t => t.description === 'Store B')!
  bulkUpdateCategories(db, [
    { transactionId: storeA.id, categoryId: shopping.id },
    { transactionId: storeB.id, categoryId: shopping.id },
  ])

  const updated = listTransactions(db, {})
  const updatedA = updated.transactions.find(t => t.description === 'Store A')!
  const updatedB = updated.transactions.find(t => t.description === 'Store B')!
  expect(updatedA.category_name).toBe('Groceries') // preserved manual override
  expect(updatedB.category_name).toBe('Shopping')   // updated
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: FAIL — `findDuplicateTransaction` and `bulkUpdateCategories` not exported

**Step 3: Add functions to `src/lib/db/transactions.ts`**

```typescript
export function findDuplicateTransaction(
  db: Database.Database,
  txn: { date: string; description: string; amount: number; type: string }
): TransactionRow | undefined {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date = ? AND t.description = ? AND t.amount = ? AND t.type = ?
  `).get([txn.date, txn.description, txn.amount, txn.type]) as TransactionRow | undefined
}

export function bulkUpdateCategories(
  db: Database.Database,
  updates: Array<{ transactionId: number; categoryId: number }>
): void {
  const update = db.prepare(
    'UPDATE transactions SET category_id = ? WHERE id = ? AND manual_category = 0'
  )
  const updateMany = db.transaction((items: typeof updates) => {
    for (const { transactionId, categoryId } of items) {
      update.run(categoryId, transactionId)
    }
  })
  updateMany(updates)
}
```

**Step 4: Also add `getTransactionsByDocumentId` (needed later for reclassification)**

```typescript
export function getTransactionsByDocumentId(db: Database.Database, documentId: number): TransactionRow[] {
  return db.prepare(`
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.document_id = ?
    ORDER BY t.date DESC
  `).all([documentId]) as TransactionRow[]
}
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/db/transactions.ts src/__tests__/lib/db/transactions.test.ts
git commit -m "feat: add duplicate detection and bulk category update"
```

---

### Task 5: Restructure LLM extraction prompt with document type detection

**Files:**
- Modify: `src/lib/claude/schemas.ts`
- Modify: `src/lib/claude/extract-transactions.ts`
- Test: `src/__tests__/lib/claude/schemas.test.ts`
- Test: `src/__tests__/lib/claude/extract-transactions.test.ts`

**Step 1: Update extraction schema in `src/lib/claude/schemas.ts`**

Add `document_type` to the extraction result:

```typescript
export const VALID_DOCUMENT_TYPES = [
  'credit_card', 'checking_account', 'savings_account', 'investment', 'other',
] as const

export const extractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  transactions: z.array(transactionSchema),
})
```

**Step 2: Update schema test in `src/__tests__/lib/claude/schemas.test.ts`**

All existing tests need `document_type` added to the test data:

```typescript
it('validates correct extraction output with category', () => {
  const valid = {
    document_type: 'checking_account',
    transactions: [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries' },
      { date: '2025-01-16', description: 'Employer Inc', amount: 3000, type: 'credit', category: 'Income' },
    ],
  }
  expect(extractionSchema.parse(valid)).toEqual(valid)
})

it('rejects invalid document type', () => {
  const invalid = {
    document_type: 'unknown_type',
    transactions: [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', category: 'Shopping' },
    ],
  }
  expect(() => extractionSchema.parse(invalid)).toThrow()
})
```

Update other tests to include `document_type: 'checking_account'` in their test data.

**Step 3: Rewrite the extraction prompt in `src/lib/claude/extract-transactions.ts`**

Replace `EXTRACTION_PROMPT` with a new context-aware version:

```typescript
const EXTRACTION_PROMPT = `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions with context-aware categorization.

STEP 1: Identify the document type:
- "credit_card" — credit card statement
- "checking_account" — checking/current account statement
- "savings_account" — savings account statement
- "investment" — investment/brokerage statement
- "other" — any other financial document

STEP 2: Extract every transaction. For each:
- date: in YYYY-MM-DD format
- description: merchant name or transaction description (clean up codes/numbers, make human-readable)
- amount: as a positive number (no currency symbols)
- type: "debit" or "credit" based on DOCUMENT TYPE CONTEXT (see below)
- category: classify into exactly one of: ${VALID_CATEGORIES.join(', ')}

DOCUMENT TYPE CONTEXT — this determines how to interpret debits and credits:
- Credit card: debits are purchases/charges, credits are payments to the card or refunds (NOT income). Use "Transfer" for bill payments, "Refund" for returned purchases.
- Checking/savings account: debits are money out (spending, transfers), credits are money in (salary, deposits). Use "Income" for salary/wages, "Transfer" for account transfers.
- Investment: debits are contributions/purchases, credits are withdrawals/dividends.

CATEGORY GUIDE:
- Groceries: supermarkets, food stores (Whole Foods, Trader Joe's, Kroger)
- Restaurants & Dining: restaurants, coffee shops, fast food, delivery
- Gas & Fuel: gas stations, EV charging
- Public Transit: bus, subway, rail, transit passes
- Rideshare & Taxi: Uber, Lyft, taxis
- Parking & Tolls: parking garages, meters, toll charges
- Rent & Mortgage: rent, mortgage payments
- Home Maintenance: repairs, cleaning, contractors, lawn care
- Utilities: electric, water, gas, internet, phone bills
- Subscriptions: streaming, SaaS, gym memberships, recurring charges
- Shopping: general retail, clothing, Amazon (non-electronics)
- Electronics: computers, phones, gadgets, tech accessories
- Health & Medical: doctor, pharmacy, hospital, dental, vision
- Fitness: gym, sports equipment, wellness apps
- Insurance: health, auto, home, life insurance premiums
- Childcare & Education: tuition, daycare, school supplies, courses
- Pets: veterinarian, pet food, pet supplies
- Travel: hotels, flights, car rental, vacation expenses
- Entertainment: movies, concerts, events, games, hobbies
- Gifts & Donations: charity, presents, tips
- Personal Care: haircuts, spa, cosmetics, personal hygiene
- Income: salary, freelance income, interest, dividends (bank accounts only)
- Transfer: account transfers, credit card bill payments, internal moves
- Refund: returns, reimbursements, chargebacks
- Fees & Charges: bank fees, late fees, ATM fees, service charges
- Other: anything that doesn't fit the above

Return ONLY valid JSON in this exact format:
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit", "category": "..."}
  ]
}

Important:
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Choose the most specific category that fits
- Use "Other" only if none of the specific categories fit`
```

**Step 4: Update mock in `src/__tests__/lib/claude/extract-transactions.test.ts`**

Update the mock response to include `document_type`:

```typescript
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              document_type: 'checking_account',
              transactions: [
                { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries' },
                { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit', category: 'Income' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})
```

Update the test assertion:

```typescript
it('extracts transactions with categories and document type from PDF buffer', async () => {
  const fakePdf = Buffer.from('fake pdf content')
  const result = await extractTransactions(fakePdf)
  expect(result.document_type).toBe('checking_account')
  expect(result.transactions).toHaveLength(2)
  expect(result.transactions[0].description).toBe('Whole Foods')
  expect(result.transactions[0].category).toBe('Groceries')
  expect(result.transactions[1].type).toBe('credit')
  expect(result.transactions[1].category).toBe('Income')
})
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/claude/schemas.ts src/lib/claude/extract-transactions.ts src/__tests__/lib/claude/schemas.test.ts src/__tests__/lib/claude/extract-transactions.test.ts
git commit -m "feat: add document type detection and context-aware extraction prompt"
```

---

### Task 6: Add reclassify function to Claude module

**Files:**
- Modify: `src/lib/claude/extract-transactions.ts`
- Create: `src/__tests__/lib/claude/reclassify.test.ts`

**Step 1: Write tests in `src/__tests__/lib/claude/reclassify.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              classifications: [
                { id: 1, category: 'Groceries' },
                { id: 2, category: 'Transfer' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('reclassifyTransactions', () => {
  it('returns category assignments for given transactions', async () => {
    const result = await reclassifyTransactions('credit_card', [
      { id: 1, date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
      { id: 2, date: '2025-01-16', description: 'Payment Thank You', amount: 500, type: 'credit' },
    ])
    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ id: 1, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ id: 2, category: 'Transfer' })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/claude/reclassify.test.ts`
Expected: FAIL — `reclassifyTransactions` not exported

**Step 3: Add reclassify function and schema to the codebase**

In `src/lib/claude/schemas.ts`, add:

```typescript
export const reclassificationSchema = z.object({
  classifications: z.array(z.object({
    id: z.number(),
    category: z.string(),
  })),
})

export type ReclassificationResult = z.infer<typeof reclassificationSchema>
```

In `src/lib/claude/extract-transactions.ts`, add:

```typescript
import { extractionSchema, reclassificationSchema, VALID_CATEGORIES, type ExtractionResult, type ReclassificationResult } from './schemas'

interface ReclassifyInput {
  id: number
  date: string
  description: string
  amount: number
  type: string
}

const RECLASSIFY_PROMPT = `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds (NOT income). Use "Transfer" for bill payments, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Income" for salary/wages.
- investment: credits are withdrawals/dividends.

CATEGORIES: ${VALID_CATEGORIES.join(', ')}

Return ONLY valid JSON:
{
  "classifications": [
    {"id": <transaction_id>, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`

export async function reclassifyTransactions(
  documentType: string,
  transactions: ReclassifyInput[]
): Promise<ReclassificationResult> {
  const client = new Anthropic()

  const prompt = RECLASSIFY_PROMPT
    .replace('{document_type}', documentType)
    .replace('{transactions_json}', JSON.stringify(transactions, null, 2))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return reclassificationSchema.parse(parsed)
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/claude/schemas.ts src/lib/claude/extract-transactions.ts src/__tests__/lib/claude/reclassify.test.ts
git commit -m "feat: add reclassifyTransactions function for category-only updates"
```

---

### Task 7: Update upload route with SHA-256 dedup and merge logic

**Files:**
- Modify: `src/app/api/upload/route.ts`

**Step 1: Rewrite `src/app/api/upload/route.ts`**

The upload route needs three flows:

1. Compute SHA-256 of the uploaded buffer
2. If hash matches an existing document → reclassify only (no file save, no extraction)
3. If no hash match → save file, extract, merge with dedup

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { createHash } from 'crypto'
import path from 'path'
import { getDb } from '@/lib/db'
import { createDocument, findDocumentByHash, updateDocumentStatus, updateDocumentType } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { getTransactionsByDocumentId, findDuplicateTransaction, bulkUpdateCategories } from '@/lib/db/transactions'
import { extractTransactions } from '@/lib/claude/extract-transactions'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'

function computeHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }

  const db = getDb()
  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = computeHash(buffer)

  // Check for existing document with same hash
  const existingDoc = findDocumentByHash(db, fileHash)

  if (existingDoc) {
    // Same file — reclassify only
    try {
      const transactions = getTransactionsByDocumentId(db, existingDoc.id)
      if (transactions.length === 0) {
        return NextResponse.json({ error: 'No transactions to reclassify' }, { status: 400 })
      }

      const reclassifyInput = transactions
        .filter(t => t.manual_category === 0)
        .map(t => ({ id: t.id, date: t.date, description: t.description, amount: t.amount, type: t.type }))

      if (reclassifyInput.length === 0) {
        return NextResponse.json({
          document_id: existingDoc.id,
          action: 'reclassify',
          transactions_updated: 0,
          message: 'All transactions have manual overrides',
        })
      }

      const result = await reclassifyTransactions(existingDoc.document_type ?? 'other', reclassifyInput)

      const categories = getAllCategories(db)
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
      const otherCategoryId = categoryMap.get('other')!

      const updates = result.classifications.map(c => ({
        transactionId: c.id,
        categoryId: categoryMap.get(c.category.toLowerCase()) ?? otherCategoryId,
      }))
      bulkUpdateCategories(db, updates)

      return NextResponse.json({
        document_id: existingDoc.id,
        action: 'reclassify',
        transactions_updated: updates.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: `Reclassification failed: ${message}` }, { status: 500 })
    }
  }

  // New file — extract and merge
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  const filename = `${Date.now()}-${file.name}`
  const filepath = path.join(uploadsDir, filename)
  await writeFile(filepath, buffer)

  const docId = createDocument(db, file.name, filepath, fileHash)
  updateDocumentStatus(db, docId, 'processing')

  try {
    const result = await extractTransactions(buffer)

    // Store detected document type
    updateDocumentType(db, docId, result.document_type)

    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    const insert = db.prepare(
      'INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    let newCount = 0
    let reclassifiedCount = 0
    const reclassifyUpdates: Array<{ transactionId: number; categoryId: number }> = []

    const mergeTransaction = db.transaction(() => {
      for (const t of result.transactions) {
        const categoryId = categoryMap.get(t.category.toLowerCase()) ?? otherCategoryId
        const existing = findDuplicateTransaction(db, {
          date: t.date, description: t.description, amount: t.amount, type: t.type,
        })

        if (existing) {
          // Duplicate — queue reclassification (respects manual flag via bulkUpdateCategories)
          reclassifyUpdates.push({ transactionId: existing.id, categoryId })
          reclassifiedCount++
        } else {
          // New transaction
          insert.run(docId, t.date, t.description, t.amount, t.type, categoryId)
          newCount++
        }
      }
    })
    mergeTransaction()

    if (reclassifyUpdates.length > 0) {
      bulkUpdateCategories(db, reclassifyUpdates)
    }

    updateDocumentStatus(db, docId, 'completed')

    return NextResponse.json({
      document_id: docId,
      action: 'extract_and_merge',
      transactions_new: newCount,
      transactions_reclassified: reclassifiedCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', message)
    return NextResponse.json({ error: `Extraction failed: ${message}` }, { status: 500 })
  }
}
```

**Step 2: Run lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat: add SHA-256 dedup with reclassify-only and extract-and-merge flows"
```

---

### Task 8: Add on-demand reclassify API route

**Files:**
- Create: `src/app/api/reclassify/[documentId]/route.ts`

**Step 1: Create the route**

```typescript
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
```

**Step 2: Run lint and build**

Run: `npm run lint`
Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/reclassify/[documentId]/route.ts
git commit -m "feat: add on-demand reclassify API route"
```

---

### Task 9: Final verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run build**

Run: `npm run build`
Expected: Successful build

**Step 4: Verify with git log**

Run: `git log --oneline`
Expected: Clean sequence of commits on the feature branch

**Step 5: Final commit if any cleanup needed, otherwise done**
