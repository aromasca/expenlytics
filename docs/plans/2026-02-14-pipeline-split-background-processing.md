# Pipeline Split & Background Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split PDF text extraction from classification into separate pipeline phases, make processing non-blocking with observable progress, and add a document management page.

**Architecture:** Upload returns immediately after saving the file. A fire-and-forget async pipeline processes documents through phases: extraction → classification → normalization. Each phase updates the document's `processing_phase` column in SQLite so the UI can poll for progress. Raw extraction data is stored as JSON on the documents table so classification can be re-run without re-reading the PDF.

**Tech Stack:** Next.js 16 App Router, better-sqlite3, Anthropic SDK (Sonnet for extraction/classification, Haiku for normalization), Zod, React polling with `setInterval`.

---

### Task 1: Schema Migration — Add Processing Phase and Raw Extraction Columns

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/documents.ts`
- Test: `src/__tests__/lib/db/documents.test.ts`

**Context:** The documents table currently has a `status` column with CHECK constraint `('pending', 'processing', 'completed', 'failed')`. We need a `processing_phase` column to track granular progress and a `raw_extraction` column to store extracted (but uncategorized) transaction data as JSON. We also add `transaction_count` for display purposes.

**Step 1: Write the failing tests**

Add to `src/__tests__/lib/db/documents.test.ts`:

```typescript
it('stores and retrieves processing_phase', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
  updateDocumentPhase(db, id, 'extraction')
  const doc = getDocument(db, id)
  expect(doc!.processing_phase).toBe('extraction')
})

it('stores and retrieves raw_extraction JSON', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
  const rawData = {
    document_type: 'credit_card',
    transactions: [
      { date: '2025-01-15', description: 'WHOLE FOODS', amount: 85.50, type: 'debit' },
    ],
  }
  updateDocumentRawExtraction(db, id, rawData)
  const stored = getDocumentRawExtraction(db, id)
  expect(stored).toEqual(rawData)
})

it('stores and retrieves transaction_count', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
  updateDocumentTransactionCount(db, id, 42)
  const doc = getDocument(db, id)
  expect(doc!.transaction_count).toBe(42)
})

it('new documents have null processing_phase and raw_extraction', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
  const doc = getDocument(db, id)
  expect(doc!.processing_phase).toBeNull()
  expect(doc!.transaction_count).toBeNull()
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: FAIL — `updateDocumentPhase` is not a function, `processing_phase` not in result

**Step 3: Implement schema migration and DB functions**

In `src/lib/db/schema.ts`, add after the existing document column migrations (after line ~154):

```typescript
if (!columnNames.includes('processing_phase')) {
  db.exec('ALTER TABLE documents ADD COLUMN processing_phase TEXT')
}
if (!columnNames.includes('raw_extraction')) {
  db.exec('ALTER TABLE documents ADD COLUMN raw_extraction TEXT')
}
if (!columnNames.includes('transaction_count')) {
  db.exec('ALTER TABLE documents ADD COLUMN transaction_count INTEGER')
}
```

In `src/lib/db/documents.ts`, update the `Document` interface:

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
  processing_phase: string | null
  raw_extraction: string | null
  transaction_count: number | null
}
```

Add new functions to `src/lib/db/documents.ts`:

```typescript
export type ProcessingPhase = 'upload' | 'extraction' | 'classification' | 'normalization' | 'complete'

export function updateDocumentPhase(db: Database.Database, id: number, phase: ProcessingPhase): void {
  db.prepare('UPDATE documents SET processing_phase = ? WHERE id = ?').run(phase, id)
}

export function updateDocumentRawExtraction(db: Database.Database, id: number, rawData: unknown): void {
  db.prepare('UPDATE documents SET raw_extraction = ? WHERE id = ?').run(JSON.stringify(rawData), id)
}

export function getDocumentRawExtraction(db: Database.Database, id: number): unknown | null {
  const row = db.prepare('SELECT raw_extraction FROM documents WHERE id = ?').get(id) as { raw_extraction: string | null } | undefined
  if (!row?.raw_extraction) return null
  return JSON.parse(row.raw_extraction)
}

export function updateDocumentTransactionCount(db: Database.Database, id: number, count: number): void {
  db.prepare('UPDATE documents SET transaction_count = ? WHERE id = ?').run(count, id)
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/documents.ts src/__tests__/lib/db/documents.test.ts
git commit -m "feat: add processing_phase, raw_extraction, transaction_count columns to documents"
```

---

### Task 2: Raw Extraction Schema and Extraction-Only LLM Function

**Files:**
- Modify: `src/lib/claude/schemas.ts`
- Modify: `src/lib/claude/extract-transactions.ts`
- Test: `src/__tests__/lib/claude/extract-transactions.test.ts`

**Context:** Currently `extractTransactions()` sends the PDF to Claude Sonnet and gets back transactions WITH categories. We need a new `extractRawTransactions()` that extracts transactions WITHOUT categories. The extraction-only prompt keeps document type detection and debit/credit context rules but removes all category assignment logic.

**Step 1: Add raw extraction schema to `src/lib/claude/schemas.ts`**

```typescript
export const rawTransactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().positive().describe('Transaction amount as a positive number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
})

export const rawExtractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  transactions: z.array(rawTransactionSchema),
})

export type RawExtractionResult = z.infer<typeof rawExtractionSchema>
export type RawTransactionData = z.infer<typeof rawTransactionSchema>
```

**Step 2: Write the failing test**

Add a new describe block to `src/__tests__/lib/claude/extract-transactions.test.ts`. This requires a separate mock setup. Create a new test file `src/__tests__/lib/claude/extract-raw-transactions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { extractRawTransactions } from '@/lib/claude/extract-transactions'

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
                { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
                { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('extractRawTransactions', () => {
  it('extracts transactions without categories', async () => {
    const fakePdf = Buffer.from('fake pdf content')
    const result = await extractRawTransactions(fakePdf)
    expect(result.document_type).toBe('checking_account')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Whole Foods')
    expect(result.transactions[0]).not.toHaveProperty('category')
    expect(result.transactions[1].type).toBe('credit')
  })
})
```

**Step 3: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/claude/extract-raw-transactions.test.ts`
Expected: FAIL — `extractRawTransactions` is not exported

**Step 4: Implement `extractRawTransactions` in `src/lib/claude/extract-transactions.ts`**

Add the extraction-only prompt (no categories, no classification):

```typescript
const RAW_EXTRACTION_PROMPT = `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions.

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

DOCUMENT TYPE CONTEXT — this determines how to interpret debits and credits:
- Credit card: debits are purchases/charges, credits are payments to the card or refunds.
- Checking/savings account: debits are money out (spending, transfers), credits are money in (salary, deposits).
- Investment: debits are contributions/purchases, credits are withdrawals/dividends.

Return ONLY valid JSON in this exact format:
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit"}
  ]
}

Important:
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Do NOT assign categories — only extract raw transaction data`
```

Add the function:

```typescript
export async function extractRawTransactions(pdfBuffer: Buffer): Promise<RawExtractionResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: RAW_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
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
  return rawExtractionSchema.parse(parsed)
}
```

Add the import at the top of the file:

```typescript
import { rawExtractionSchema, type RawExtractionResult } from './schemas'
```

**Step 5: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/claude/extract-raw-transactions.test.ts`
Expected: PASS

**Step 6: Run all existing extraction tests to ensure no regression**

Run: `npm test -- src/__tests__/lib/claude/extract-transactions.test.ts`
Expected: PASS (existing `extractTransactions` unchanged)

**Step 7: Commit**

```bash
git add src/lib/claude/schemas.ts src/lib/claude/extract-transactions.ts src/__tests__/lib/claude/extract-raw-transactions.test.ts
git commit -m "feat: add extractRawTransactions for extraction-only pipeline step"
```

---

### Task 3: Classification-Only LLM Function

**Files:**
- Modify: `src/lib/claude/extract-transactions.ts`
- Modify: `src/lib/claude/schemas.ts`
- Create: `src/__tests__/lib/claude/classify-transactions.test.ts`

**Context:** We need a `classifyTransactions()` function that takes raw extracted transactions (no IDs, from the stored raw_extraction data) and returns categories matched by index. This is similar to `reclassifyTransactions()` but works with indexable raw data rather than DB rows with IDs. Uses the same classification prompt with the full category taxonomy.

**Step 1: Add classification schema to `src/lib/claude/schemas.ts`**

```typescript
export const classificationSchema = z.object({
  classifications: z.array(z.object({
    index: z.number(),
    category: z.string(),
  })),
})

export type ClassificationResult = z.infer<typeof classificationSchema>
```

**Step 2: Write the failing test**

Create `src/__tests__/lib/claude/classify-transactions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { classifyTransactions } from '@/lib/claude/extract-transactions'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              classifications: [
                { index: 0, category: 'Groceries' },
                { index: 1, category: 'Salary & Wages' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('classifyTransactions', () => {
  it('classifies raw transactions by index', async () => {
    const transactions = [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' as const },
      { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit' as const },
    ]
    const result = await classifyTransactions('checking_account', transactions)
    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ index: 0, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ index: 1, category: 'Salary & Wages' })
  })
})
```

**Step 3: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/claude/classify-transactions.test.ts`
Expected: FAIL — `classifyTransactions` is not exported

**Step 4: Implement `classifyTransactions`**

Add to `src/lib/claude/extract-transactions.ts`:

```typescript
import { classificationSchema, type ClassificationResult, type RawTransactionData } from './schemas'

const CLASSIFY_PROMPT = `You are a financial transaction categorizer. Given the document type and a list of transactions (identified by index), assign the most specific and appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- investment: credits are withdrawals/dividends.

APPROACH: For each transaction, first identify which GROUP it belongs to, then pick the most specific category within that group.

CATEGORIES BY GROUP:
- Food & Drink: Groceries, Restaurants, Coffee & Cafes, Fast Food, Food Delivery, Bars & Alcohol
- Transportation: Gas & Fuel, Public Transit, Rideshare & Taxi, Parking & Tolls, Car Maintenance, Car Payment, Car Insurance
- Housing: Rent & Mortgage, Utilities, Internet & Phone, Home Maintenance, Home Improvement, Furniture & Decor, Home Insurance
- Shopping: Clothing & Accessories, Electronics, Office Supplies, Home Goods, Books, Sporting Goods, General Merchandise
- Health & Wellness: Health Insurance, Medical & Dental, Pharmacy, Fitness & Gym, Mental Health, Vision & Eye Care
- Entertainment: Movies & Theater, Music & Concerts, Gaming, Streaming Services, Sports & Outdoors, Hobbies
- Personal: Personal Care & Beauty, Haircuts & Salon, Laundry & Dry Cleaning
- Education: Tuition & School Fees, Books & Supplies, Online Courses
- Kids & Family: Childcare, Kids Activities, Baby & Kids Supplies
- Pets: Pet Food & Supplies, Veterinary, Pet Services
- Travel: Flights, Hotels & Lodging, Rental Cars, Travel Activities, Travel Insurance
- Financial: Fees & Charges, Interest & Finance Charges, Taxes, Investments, Savings
- Gifts & Giving: Gifts, Charitable Donations
- Income & Transfers: Salary & Wages, Freelance Income, Refund, Transfer, ATM Withdrawal
- Software & Services: AI & Productivity Software, SaaS & Subscriptions
- Other: Other

KEY DISAMBIGUATION:
- Starbucks/Dunkin → Coffee & Cafes (not Restaurants)
- DoorDash/Uber Eats → Food Delivery (not Restaurants)
- Netflix/Spotify/Disney+ → Streaming Services
- Amazon → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

Return ONLY valid JSON:
{
  "classifications": [
    {"index": 0, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`

export async function classifyTransactions(
  documentType: string,
  transactions: RawTransactionData[]
): Promise<ClassificationResult> {
  const client = new Anthropic()

  const indexed = transactions.map((t, i) => ({ index: i, ...t }))
  const prompt = CLASSIFY_PROMPT
    .replace('{document_type}', documentType)
    .replace('{transactions_json}', JSON.stringify(indexed, null, 2))

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
  return classificationSchema.parse(parsed)
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/claude/classify-transactions.test.ts`
Expected: PASS

**Step 6: Run all claude tests for regression**

Run: `npm test -- src/__tests__/lib/claude/`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/lib/claude/schemas.ts src/lib/claude/extract-transactions.ts src/__tests__/lib/claude/classify-transactions.test.ts
git commit -m "feat: add classifyTransactions for index-based classification step"
```

---

### Task 4: Document Processing Pipeline

**Files:**
- Create: `src/lib/pipeline.ts`
- Create: `src/__tests__/lib/pipeline.test.ts`

**Context:** The processing pipeline orchestrates the three phases: extraction → classification → normalization. It updates `processing_phase` and `status` at each step. It stores raw extraction data on the document and inserts classified transactions into the DB. On failure, the document is left in the failed state with `processing_phase` indicating where it failed.

**Step 1: Write the failing tests**

Create `src/__tests__/lib/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument, getDocument, updateDocumentStatus } from '@/lib/db/documents'
import { listTransactions } from '@/lib/db/transactions'

// Module-level spies for assertions
const mockExtractRaw = vi.fn()
const mockClassify = vi.fn()
const mockNormalize = vi.fn()

vi.mock('@/lib/claude/extract-transactions', () => ({
  extractRawTransactions: (...args: unknown[]) => mockExtractRaw(...args),
  classifyTransactions: (...args: unknown[]) => mockClassify(...args),
}))

vi.mock('@/lib/claude/normalize-merchants', () => ({
  normalizeMerchants: (...args: unknown[]) => mockNormalize(...args),
}))

import { processDocument } from '@/lib/pipeline'

describe('processDocument', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    vi.clearAllMocks()
  })

  it('processes a document through all phases', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
        { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit' },
      ],
    })

    mockClassify.mockResolvedValue({
      classifications: [
        { index: 0, category: 'Groceries' },
        { index: 1, category: 'Salary & Wages' },
      ],
    })

    mockNormalize.mockResolvedValue(new Map([
      ['Whole Foods', 'Whole Foods Market'],
    ]))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('completed')
    expect(doc!.processing_phase).toBe('complete')
    expect(doc!.document_type).toBe('checking_account')
    expect(doc!.raw_extraction).not.toBeNull()
    expect(doc!.transaction_count).toBe(2)

    const { transactions } = listTransactions(db, { document_id: docId })
    expect(transactions).toHaveLength(2)
    // Verify classification was applied
    const groceryTxn = transactions.find(t => t.description === 'Whole Foods')
    expect(groceryTxn!.category_name).toBe('Groceries')
    // Verify normalization was applied
    expect(groceryTxn!.normalized_merchant).toBe('Whole Foods Market')
  })

  it('stores raw extraction data on the document', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    const rawData = {
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'Amazon', amount: 42.99, type: 'debit' },
      ],
    }
    mockExtractRaw.mockResolvedValue(rawData)
    mockClassify.mockResolvedValue({
      classifications: [{ index: 0, category: 'General Merchandise' }],
    })
    mockNormalize.mockResolvedValue(new Map())

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    const stored = JSON.parse(doc!.raw_extraction!)
    expect(stored.document_type).toBe('credit_card')
    expect(stored.transactions).toHaveLength(1)
  })

  it('sets status to failed with phase on extraction error', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockRejectedValue(new Error('API timeout'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('failed')
    expect(doc!.processing_phase).toBe('extraction')
    expect(doc!.error_message).toContain('API timeout')
  })

  it('sets status to failed with phase on classification error', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [{ date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' }],
    })
    mockClassify.mockRejectedValue(new Error('Classification failed'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('failed')
    expect(doc!.processing_phase).toBe('classification')
  })

  it('completes even if normalization fails', async () => {
    const docId = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
    updateDocumentStatus(db, docId, 'processing')

    mockExtractRaw.mockResolvedValue({
      document_type: 'checking_account',
      transactions: [{ date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' }],
    })
    mockClassify.mockResolvedValue({
      classifications: [{ index: 0, category: 'General Merchandise' }],
    })
    mockNormalize.mockRejectedValue(new Error('Normalization timeout'))

    await processDocument(db, docId)

    const doc = getDocument(db, docId)
    expect(doc!.status).toBe('completed')
    expect(doc!.processing_phase).toBe('complete')
    // Transactions should still be inserted
    const { transactions } = listTransactions(db, { document_id: docId })
    expect(transactions).toHaveLength(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/pipeline.test.ts`
Expected: FAIL — module `@/lib/pipeline` not found

**Step 3: Implement the pipeline**

Create `src/lib/pipeline.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/pipeline.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pipeline.ts src/__tests__/lib/pipeline.test.ts
git commit -m "feat: add document processing pipeline with phased extraction/classification/normalization"
```

---

### Task 5: Refactor Upload Route to Be Non-Blocking

**Files:**
- Modify: `src/app/api/upload/route.ts`
- Modify: `src/components/upload-zone.tsx`

**Context:** The upload route currently blocks while extracting, classifying, and normalizing. We refactor it to save the file, create the document record, fire off `processDocument()` in the background, and return immediately with the document ID and `'processing'` status. The upload zone UI is updated to handle the new response shape.

The duplicate file re-upload path (reclassification) stays synchronous for now since it's much faster.

**Step 1: Refactor the upload route**

Replace the new-file processing section of `src/app/api/upload/route.ts` (lines 80-165). Keep the duplicate-file section (lines 36-78) as-is.

The new file processing becomes:

```typescript
// New file — save and start background processing
const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
await mkdir(uploadsDir, { recursive: true })

const sanitizedName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')
const filename = `${Date.now()}-${sanitizedName}`
const filepath = path.join(uploadsDir, filename)

const resolvedUploadsDir = path.resolve(uploadsDir)
const resolvedFilepath = path.resolve(filepath)
if (!resolvedFilepath.startsWith(resolvedUploadsDir + path.sep)) {
  return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
}

await writeFile(filepath, buffer)

const docId = createDocument(db, file.name, filepath, fileHash)
updateDocumentStatus(db, docId, 'processing')

// Fire and forget — processDocument runs in background
processDocument(db, docId).catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  updateDocumentStatus(db, docId, 'failed', message)
})

return NextResponse.json({
  document_id: docId,
  action: 'processing',
  status: 'processing',
})
```

Add import at top:
```typescript
import { processDocument } from '@/lib/pipeline'
```

Remove now-unused imports: `extractTransactions` and `normalizeMerchants` (keep `reclassifyTransactions` for the duplicate path). Remove `getTransactionsByDocumentId` only if unused. Check the duplicate path at line 39 — it still uses it, so keep it.

**Step 2: Update upload-zone to handle new response**

In `src/components/upload-zone.tsx`, update `handleUpload` to handle the async response:

```typescript
const handleUpload = useCallback(async (file: File) => {
  setIsUploading(true)
  setError(null)

  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Upload failed')
      return
    }

    onUploadComplete()
  } catch {
    setError('Upload failed. Please try again.')
  } finally {
    setIsUploading(false)
  }
}, [onUploadComplete])
```

The upload zone stays largely the same — `onUploadComplete` still fires. The parent page can decide to show a "processing started" indicator. The key change is the upload returns instantly now.

**Step 3: Run the full test suite to verify no regressions**

Run: `npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/app/api/upload/route.ts src/components/upload-zone.tsx
git commit -m "feat: make upload non-blocking with background pipeline processing"
```

---

### Task 6: Document Management DB Functions

**Files:**
- Modify: `src/lib/db/documents.ts`
- Test: `src/__tests__/lib/db/documents.test.ts`

**Context:** Enhance the document DB layer with functions needed by the document management page: listing documents with transaction counts, deleting a document and its transactions, and a function to count transactions per document.

**Step 1: Write failing tests**

Add to `src/__tests__/lib/db/documents.test.ts`:

```typescript
import { insertTransactions, listTransactions } from '@/lib/db/transactions'
// (already imported at top)

it('lists documents with transaction counts via listDocumentsWithCounts', () => {
  const id1 = createDocument(db, 'jan.pdf', '/path/jan.pdf', 'hash1')
  updateDocumentStatus(db, id1, 'completed')
  insertTransactions(db, id1, [
    { date: '2025-01-15', description: 'Store A', amount: 50, type: 'debit' },
    { date: '2025-01-16', description: 'Store B', amount: 30, type: 'debit' },
  ])

  const id2 = createDocument(db, 'feb.pdf', '/path/feb.pdf', 'hash2')
  updateDocumentStatus(db, id2, 'processing')

  const docs = listDocumentsWithCounts(db)
  expect(docs).toHaveLength(2)
  expect(docs[0].filename).toBe('feb.pdf') // newest first
  expect(docs[0].actual_transaction_count).toBe(0)
  expect(docs[1].filename).toBe('jan.pdf')
  expect(docs[1].actual_transaction_count).toBe(2)
})

it('deleteDocument removes document and cascades to transactions', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash1')
  updateDocumentStatus(db, id, 'completed')
  insertTransactions(db, id, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])

  deleteDocument(db, id)

  expect(getDocument(db, id)).toBeUndefined()
  const { transactions } = listTransactions(db, { document_id: id })
  expect(transactions).toHaveLength(0)
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: FAIL — `listDocumentsWithCounts` and `deleteDocument` not found

**Step 3: Implement new functions**

Add to `src/lib/db/documents.ts`:

```typescript
export interface DocumentWithCounts extends Document {
  actual_transaction_count: number
}

export function listDocumentsWithCounts(db: Database.Database): DocumentWithCounts[] {
  return db.prepare(`
    SELECT d.*, COUNT(t.id) as actual_transaction_count
    FROM documents d
    LEFT JOIN transactions t ON t.document_id = d.id
    GROUP BY d.id
    ORDER BY d.uploaded_at DESC, d.id DESC
  `).all() as DocumentWithCounts[]
}

export function deleteDocument(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id)
}
```

Note: The CASCADE on `transactions.document_id` handles deleting related transactions automatically.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/documents.ts src/__tests__/lib/db/documents.test.ts
git commit -m "feat: add listDocumentsWithCounts and deleteDocument DB functions"
```

---

### Task 7: Document Status and Management API Endpoints

**Files:**
- Modify: `src/app/api/documents/route.ts`
- Create: `src/app/api/documents/[id]/route.ts`
- Create: `src/app/api/documents/[id]/reprocess/route.ts`

**Context:** Enhance the documents API to support the management page. The listing endpoint returns documents with counts and processing phase. A per-document endpoint allows getting detail and deleting. A reprocess endpoint re-runs classification + normalization from stored raw extraction data.

**Step 1: Enhance GET /api/documents**

Replace `src/app/api/documents/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listDocumentsWithCounts } from '@/lib/db/documents'

export async function GET() {
  const db = getDb()
  const documents = listDocumentsWithCounts(db)
  return NextResponse.json(documents)
}
```

**Step 2: Create GET/DELETE /api/documents/[id]**

Create `src/app/api/documents/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, deleteDocument } from '@/lib/db/documents'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const doc = getDocument(db, Number(id))
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json(doc)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const doc = getDocument(db, Number(id))
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  deleteDocument(db, Number(id))
  return NextResponse.json({ success: true })
}
```

**Step 3: Create POST /api/documents/[id]/reprocess**

Create `src/app/api/documents/[id]/reprocess/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getDocument, getDocumentRawExtraction, updateDocumentStatus, updateDocumentPhase } from '@/lib/db/documents'
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
    // Get existing transactions for this document (non-manual only)
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
```

**Step 4: Run the full test suite**

Run: `npm test`
Expected: All PASS

**Step 5: Commit**

```bash
git add "src/app/api/documents/route.ts" "src/app/api/documents/[id]/route.ts" "src/app/api/documents/[id]/reprocess/route.ts"
git commit -m "feat: add document management API endpoints (detail, delete, reprocess)"
```

---

### Task 8: Documents Page UI

**Files:**
- Create: `src/app/(app)/documents/page.tsx`
- Create: `src/components/documents-table.tsx`
- Create: `src/components/processing-status.tsx`

**Context:** New page at `/documents` showing all uploaded files with processing status, transaction counts, and management actions (reprocess, delete). Auto-polls for status updates every 2 seconds when any document is processing. Includes upload zone at the top.

**Step 1: Create the processing status component**

Create `src/components/processing-status.tsx`:

```tsx
'use client'

const PHASES = ['upload', 'extraction', 'classification', 'normalization', 'complete'] as const
const PHASE_LABELS: Record<string, string> = {
  upload: 'Uploaded',
  extraction: 'Extracting',
  classification: 'Classifying',
  normalization: 'Normalizing',
  complete: 'Complete',
}

interface ProcessingStatusProps {
  status: string
  phase: string | null
  errorMessage: string | null
}

export function ProcessingStatus({ status, phase, errorMessage }: ProcessingStatusProps) {
  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        <span className="text-xs text-destructive">
          Failed{phase ? ` at ${PHASE_LABELS[phase] ?? phase}` : ''}
        </span>
        {errorMessage && (
          <span className="text-[11px] text-muted-foreground truncate max-w-48" title={errorMessage}>
            — {errorMessage}
          </span>
        )}
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs text-muted-foreground">Completed</span>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        <span className="text-xs text-muted-foreground">Pending</span>
      </div>
    )
  }

  // Processing — show phase progress
  const currentIdx = phase ? PHASES.indexOf(phase as typeof PHASES[number]) : 0
  return (
    <div className="flex items-center gap-1">
      {PHASES.slice(1, -1).map((p, i) => {
        const phaseIdx = i + 1 // offset because we skip 'upload'
        const isComplete = currentIdx > phaseIdx
        const isCurrent = currentIdx === phaseIdx
        return (
          <div key={p} className="flex items-center gap-1">
            <div
              className={`h-1.5 w-6 rounded-full transition-colors ${
                isComplete ? 'bg-emerald-500' : isCurrent ? 'bg-foreground animate-pulse' : 'bg-muted'
              }`}
              title={PHASE_LABELS[p]}
            />
          </div>
        )
      })}
      <span className="text-[11px] text-muted-foreground ml-1">
        {PHASE_LABELS[phase ?? 'extraction'] ?? 'Processing'}...
      </span>
    </div>
  )
}
```

**Step 2: Create the documents table component**

Create `src/components/documents-table.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProcessingStatus } from '@/components/processing-status'
import { RotateCw, Trash2, RefreshCw } from 'lucide-react'

interface DocumentRow {
  id: number
  filename: string
  uploaded_at: string
  status: string
  processing_phase: string | null
  error_message: string | null
  document_type: string | null
  transaction_count: number | null
  actual_transaction_count: number
}

interface DocumentsTableProps {
  documents: DocumentRow[]
  onRefresh: () => void
}

export function DocumentsTable({ documents, onRefresh }: DocumentsTableProps) {
  const [actionInProgress, setActionInProgress] = useState<number | null>(null)

  const handleReprocess = async (docId: number) => {
    setActionInProgress(docId)
    try {
      await fetch(`/api/documents/${docId}/reprocess`, { method: 'POST' })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDelete = async (docId: number) => {
    if (!confirm('Delete this document and all its transactions?')) return
    setActionInProgress(docId)
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  const handleRetry = async (docId: number) => {
    setActionInProgress(docId)
    try {
      // Re-upload triggers reprocessing via the pipeline
      // For retry, we reprocess from stored data or re-trigger
      await fetch(`/api/documents/${docId}/reprocess`, { method: 'POST' })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No documents uploaded yet. Drop a PDF above to get started.
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left font-medium text-muted-foreground px-3 py-2">File</th>
            <th className="text-left font-medium text-muted-foreground px-3 py-2">Uploaded</th>
            <th className="text-left font-medium text-muted-foreground px-3 py-2">Type</th>
            <th className="text-left font-medium text-muted-foreground px-3 py-2">Status</th>
            <th className="text-right font-medium text-muted-foreground px-3 py-2 tabular-nums">Txns</th>
            <th className="text-right font-medium text-muted-foreground px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => (
            <tr key={doc.id} className="border-b last:border-b-0">
              <td className="px-3 py-1.5 font-medium truncate max-w-48" title={doc.filename}>
                {doc.filename}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {new Date(doc.uploaded_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {doc.document_type?.replace('_', ' ') ?? '—'}
              </td>
              <td className="px-3 py-1.5">
                <ProcessingStatus
                  status={doc.status}
                  phase={doc.processing_phase}
                  errorMessage={doc.error_message}
                />
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                {doc.actual_transaction_count || '—'}
              </td>
              <td className="px-3 py-1.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  {doc.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Retry"
                      disabled={actionInProgress === doc.id}
                      onClick={() => handleRetry(doc.id)}
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                  )}
                  {doc.status === 'completed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Reprocess"
                      disabled={actionInProgress === doc.id}
                      onClick={() => handleReprocess(doc.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                  {doc.status !== 'processing' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete"
                      disabled={actionInProgress === doc.id}
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 3: Create the documents page**

Create `src/app/(app)/documents/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { DocumentsTable } from '@/components/documents-table'

interface DocumentRow {
  id: number
  filename: string
  uploaded_at: string
  status: string
  processing_phase: string | null
  error_message: string | null
  document_type: string | null
  transaction_count: number | null
  actual_transaction_count: number
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(() => {
    fetch('/api/documents')
      .then(res => res.json())
      .then(data => {
        setDocuments(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-poll when any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing')
    if (!hasProcessing) return

    const interval = setInterval(fetchDocuments, 2000)
    return () => clearInterval(interval)
  }, [documents, fetchDocuments])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Documents</h1>
      </div>

      <UploadZone onUploadComplete={fetchDocuments} />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DocumentsTable documents={documents} onRefresh={fetchDocuments} />
      )}
    </div>
  )
}
```

**Step 4: Verify the page renders**

Run: `npm run build` (or `npm run dev` and navigate to `/documents`)
Expected: Page renders without errors

**Step 5: Commit**

```bash
git add "src/app/(app)/documents/page.tsx" src/components/documents-table.tsx src/components/processing-status.tsx
git commit -m "feat: add documents page with processing status and management actions"
```

---

### Task 9: Update Sidebar Navigation

**Files:**
- Modify: `src/components/sidebar.tsx`

**Context:** Add "Documents" link to the sidebar between Transactions and Reports. Uses the `FileText` icon from lucide-react.

**Step 1: Update sidebar**

In `src/components/sidebar.tsx`, add the import and nav item:

```typescript
import { Receipt, BarChart3, RefreshCw, Settings, Lightbulb, FileText } from 'lucide-react'

const navItems = [
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/subscriptions', label: 'Recurring', icon: RefreshCw },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

**Step 2: Verify it renders**

Run: `npm run build`
Expected: Build succeeds, sidebar shows Documents link

**Step 3: Run full test suite**

Run: `npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: add Documents link to sidebar navigation"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Schema migration (phase, raw_extraction, count) | — | schema.ts, documents.ts, documents.test.ts |
| 2 | Raw extraction schema + `extractRawTransactions` | extract-raw-transactions.test.ts | schemas.ts, extract-transactions.ts |
| 3 | `classifyTransactions` function | classify-transactions.test.ts | extract-transactions.ts, schemas.ts |
| 4 | Processing pipeline orchestrator | pipeline.ts, pipeline.test.ts | — |
| 5 | Non-blocking upload route | — | upload/route.ts, upload-zone.tsx |
| 6 | Document management DB functions | — | documents.ts, documents.test.ts |
| 7 | Document API endpoints | documents/[id]/route.ts, .../reprocess/route.ts | documents/route.ts |
| 8 | Documents page UI | documents/page.tsx, documents-table.tsx, processing-status.tsx | — |
| 9 | Sidebar navigation update | — | sidebar.tsx |

**Key design decisions:**
- Raw extraction stored as JSON on documents table — immutable once extracted
- Classification is a separate LLM call from extraction — can be re-run independently
- Normalization failure is non-blocking (existing pattern preserved)
- Fire-and-forget background processing in upload route (no external queue needed)
- UI polls every 2s when documents are processing
- Reprocess uses existing `reclassifyTransactions` for DB-backed transactions
- `manual_category` overrides respected in all reprocessing paths
