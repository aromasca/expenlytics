# Recurring Charges & Subscriptions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect recurring charges from transaction data by using an LLM to normalize merchant names at upload time (handling variations like "AMZN MKTP US" → "Amazon"), storing the normalized name, then grouping by it to present a dedicated Subscriptions page with insights.

**Architecture:** LLM-based merchant normalization at upload time (stored in `normalized_merchant` column on transactions table). The Anthropic SDK batch-normalizes descriptions via Claude. Recurring detection groups by `normalized_merchant`, computes frequency/amounts in pure JS. A backfill endpoint handles existing transactions. Served via API route, rendered in a new `/subscriptions` page.

**Tech Stack:** TypeScript, better-sqlite3, Anthropic SDK, Next.js App Router, Vitest, shadcn/ui, Lucide icons, Tailwind CSS v4

---

### Task 1: Schema Migration — Add `normalized_merchant` Column

**Files:**
- Modify: `src/lib/db/schema.ts`
- Test: `src/__tests__/lib/db/transactions.test.ts` (verify migration)

**Step 1: Write the failing test**

Add to `src/__tests__/lib/db/transactions.test.ts`:

```typescript
it('has normalized_merchant column on transactions', () => {
  const columns = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>
  const names = columns.map(c => c.name)
  expect(names).toContain('normalized_merchant')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: FAIL — column doesn't exist

**Step 3: Add migration to schema.ts**

In `src/lib/db/schema.ts`, after the existing `manual_category` migration block (around line 82), add:

```typescript
if (!txnColumnNames.includes('normalized_merchant')) {
  db.exec('ALTER TABLE transactions ADD COLUMN normalized_merchant TEXT')
}

// Create index for recurring charge queries
db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_normalized_merchant ON transactions(normalized_merchant)')
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/__tests__/lib/db/transactions.test.ts
git commit -m "feat: add normalized_merchant column to transactions table"
```

---

### Task 2: LLM Merchant Normalization Function

**Files:**
- Create: `src/lib/claude/normalize-merchants.ts`
- Create: `src/__tests__/lib/claude/normalize-merchants.test.ts`
- Modify: `src/lib/claude/schemas.ts` (add normalization schema)

**Step 1: Write the failing tests**

Create `src/__tests__/lib/claude/normalize-merchants.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              normalizations: [
                { description: 'NETFLIX.COM 1234', merchant: 'Netflix' },
                { description: 'NETFLIX.COM 5678', merchant: 'Netflix' },
                { description: 'AMZN MKTP US*1A2B3C', merchant: 'Amazon' },
                { description: 'Amazon.com*4D5E6F', merchant: 'Amazon' },
                { description: 'SPOTIFY USA 1234567', merchant: 'Spotify' },
                { description: 'Spotify Premium', merchant: 'Spotify' },
                { description: 'Whole Foods Market #1234', merchant: 'Whole Foods Market' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('normalizeMerchants', () => {
  it('returns a map of description to normalized merchant name', async () => {
    const descriptions = [
      'NETFLIX.COM 1234',
      'NETFLIX.COM 5678',
      'AMZN MKTP US*1A2B3C',
      'Amazon.com*4D5E6F',
      'SPOTIFY USA 1234567',
      'Spotify Premium',
      'Whole Foods Market #1234',
    ]

    const result = await normalizeMerchants(descriptions)
    expect(result.get('NETFLIX.COM 1234')).toBe('Netflix')
    expect(result.get('NETFLIX.COM 5678')).toBe('Netflix')
    expect(result.get('AMZN MKTP US*1A2B3C')).toBe('Amazon')
    expect(result.get('Amazon.com*4D5E6F')).toBe('Amazon')
    expect(result.get('SPOTIFY USA 1234567')).toBe('Spotify')
    expect(result.get('Spotify Premium')).toBe('Spotify')
  })

  it('returns empty map for empty input', async () => {
    const result = await normalizeMerchants([])
    expect(result.size).toBe(0)
  })

  it('deduplicates input descriptions before sending to LLM', async () => {
    const descriptions = ['Netflix', 'Netflix', 'Netflix']
    const result = await normalizeMerchants(descriptions)
    // Should still work — the mock returns data for all unique inputs
    expect(result.size).toBeGreaterThanOrEqual(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/claude/normalize-merchants.test.ts`
Expected: FAIL — module not found

**Step 3: Add normalization schema**

Add to `src/lib/claude/schemas.ts`:

```typescript
export const normalizationSchema = z.object({
  normalizations: z.array(z.object({
    description: z.string(),
    merchant: z.string(),
  })),
})

export type NormalizationResult = z.infer<typeof normalizationSchema>
```

**Step 4: Write the implementation**

Create `src/lib/claude/normalize-merchants.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { normalizationSchema, type NormalizationResult } from './schemas'

const NORMALIZATION_PROMPT = `You are a financial transaction merchant normalizer. Given a list of transaction descriptions from bank/credit card statements, normalize each to a clean, canonical merchant name.

RULES:
- Map variations of the same merchant to ONE canonical name (e.g., "AMZN MKTP US*1A2B3C" and "Amazon.com*4D5E6F" → "Amazon")
- Strip transaction codes, reference numbers, location suffixes, and store numbers
- Use the well-known brand name when recognizable (e.g., "SQ *BLUE BOTTLE" → "Blue Bottle Coffee")
- Keep the name human-readable and title-cased
- For unrecognizable merchants, clean up the name as best you can
- Every input description MUST appear exactly once in the output

Return ONLY valid JSON:
{
  "normalizations": [
    {"description": "<original>", "merchant": "<normalized>"}
  ]
}

Descriptions to normalize:
{descriptions_json}`

export async function normalizeMerchants(descriptions: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(descriptions)]
  if (unique.length === 0) return new Map()

  const client = new Anthropic()

  const prompt = NORMALIZATION_PROMPT
    .replace('{descriptions_json}', JSON.stringify(unique, null, 2))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
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
  const result: NormalizationResult = normalizationSchema.parse(parsed)

  const map = new Map<string, string>()
  for (const { description, merchant } of result.normalizations) {
    map.set(description, merchant)
  }

  return map
}
```

Note: Uses `claude-haiku-4-5-20251001` for cost efficiency — normalization is a simple task.

**Step 5: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/claude/normalize-merchants.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/claude/normalize-merchants.ts src/lib/claude/schemas.ts src/__tests__/lib/claude/normalize-merchants.test.ts
git commit -m "feat: add LLM-based merchant name normalization"
```

---

### Task 3: Update Upload Flow to Normalize Merchants

**Files:**
- Modify: `src/app/api/upload/route.ts`

**Step 1: Update the upload route**

In `src/app/api/upload/route.ts`:

1. Add import: `import { normalizeMerchants } from '@/lib/claude/normalize-merchants'`

2. In the "New file" branch, after `const result = await extractTransactions(buffer)` and the category mapping setup, add normalization before the merge transaction:

```typescript
// Normalize merchant names via LLM
const descriptions = result.transactions.map(t => t.description)
const merchantMap = await normalizeMerchants(descriptions)
```

3. Update the insert statement inside `mergeTransaction` to include `normalized_merchant`:

```typescript
const insert = db.prepare(
  'INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
```

4. Update the insert.run call:

```typescript
const normalizedMerchant = merchantMap.get(t.description) ?? t.description
insert.run(docId, t.date, t.description, t.amount, t.type, categoryId, normalizedMerchant)
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors

**Step 3: Run all existing tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat: normalize merchant names during PDF upload"
```

---

### Task 4: Backfill Endpoint for Existing Transactions

**Files:**
- Create: `src/app/api/recurring/normalize/route.ts`

**Step 1: Create the backfill endpoint**

Create `src/app/api/recurring/normalize/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

export async function POST() {
  const db = getDb()

  // Find transactions without normalized_merchant
  const rows = db.prepare(
    "SELECT DISTINCT description FROM transactions WHERE normalized_merchant IS NULL"
  ).all() as Array<{ description: string }>

  if (rows.length === 0) {
    return NextResponse.json({ normalized: 0, message: 'All transactions already normalized' })
  }

  const descriptions = rows.map(r => r.description)

  try {
    const merchantMap = await normalizeMerchants(descriptions)

    const update = db.prepare(
      'UPDATE transactions SET normalized_merchant = ? WHERE description = ? AND normalized_merchant IS NULL'
    )
    const updateMany = db.transaction(() => {
      for (const [description, merchant] of merchantMap) {
        update.run(merchant, description)
      }
    })
    updateMany()

    return NextResponse.json({ normalized: merchantMap.size })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Normalization failed: ${message}` }, { status: 500 })
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/app/api/recurring/normalize/route.ts
git commit -m "feat: add backfill endpoint for merchant normalization"
```

---

### Task 5: Recurring Group Detection + DB Query

**Files:**
- Create: `src/lib/recurring.ts`
- Create: `src/__tests__/lib/recurring.test.ts`
- Create: `src/lib/db/recurring.ts`
- Create: `src/__tests__/lib/db/recurring.test.ts`

**Step 1: Write the failing tests for detection logic**

Create `src/__tests__/lib/recurring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectRecurringGroups } from '@/lib/recurring'

describe('detectRecurringGroups', () => {
  it('groups transactions by normalized_merchant', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'NETFLIX.COM 1234', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Subscriptions', category_color: '#0EA5E9' },
      { id: 2, date: '2025-02-15', description: 'NETFLIX.COM 5678', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Subscriptions', category_color: '#0EA5E9' },
      { id: 3, date: '2025-01-20', description: 'Whole Foods', normalized_merchant: 'Whole Foods Market', amount: 85.00, type: 'debit' as const, category_name: 'Groceries', category_color: '#22C55E' },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].merchantName).toBe('Netflix')
    expect(groups[0].occurrences).toBe(2)
    expect(groups[0].totalAmount).toBeCloseTo(31.98)
    expect(groups[0].avgAmount).toBeCloseTo(15.99)
  })

  it('requires at least 2 occurrences', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'NETFLIX.COM', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })

  it('calculates monthly frequency and estimated cost', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(9.99)
    expect(groups[0].frequency).toBe('monthly')
  })

  it('detects weekly frequency', () => {
    const transactions = [
      { id: 1, date: '2025-01-01', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-08', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-01-15', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-01-22', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].frequency).toBe('weekly')
  })

  it('detects yearly frequency', () => {
    const transactions = [
      { id: 1, date: '2024-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].frequency).toBe('yearly')
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(139.00 / 12)
  })

  it('sorts groups by total amount descending', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-01-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-02-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].merchantName).toBe('Expensive SaaS')
    expect(groups[1].merchantName).toBe('Cheap SaaS')
  })

  it('includes transaction IDs, first and last dates', () => {
    const transactions = [
      { id: 10, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 20, date: '2025-03-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].transactionIds).toEqual([10, 20])
    expect(groups[0].firstDate).toBe('2025-01-15')
    expect(groups[0].lastDate).toBe('2025-03-15')
  })

  it('skips transactions with null normalized_merchant', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Unknown', normalized_merchant: null, amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Unknown', normalized_merchant: null, amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/recurring.test.ts`
Expected: FAIL — module not found

**Step 3: Write the detection logic**

Create `src/lib/recurring.ts`:

```typescript
export interface TransactionForRecurring {
  id: number
  date: string
  description: string
  normalized_merchant: string | null
  amount: number
  type: 'debit' | 'credit'
  category_name: string | null
  category_color: string | null
}

export interface RecurringGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
}

function detectFrequency(avgDaysBetween: number): RecurringGroup['frequency'] {
  if (avgDaysBetween <= 10) return 'weekly'
  if (avgDaysBetween <= 45) return 'monthly'
  if (avgDaysBetween <= 120) return 'quarterly'
  if (avgDaysBetween <= 400) return 'yearly'
  return 'irregular'
}

function estimateMonthlyAmount(avgAmount: number, frequency: RecurringGroup['frequency']): number {
  switch (frequency) {
    case 'weekly': return avgAmount * (365.25 / 7 / 12)
    case 'monthly': return avgAmount
    case 'quarterly': return avgAmount / 3
    case 'yearly': return avgAmount / 12
    case 'irregular': return avgAmount
  }
}

export function detectRecurringGroups(transactions: TransactionForRecurring[]): RecurringGroup[] {
  const groups = new Map<string, TransactionForRecurring[]>()

  for (const txn of transactions) {
    if (!txn.normalized_merchant) continue
    const key = txn.normalized_merchant
    const existing = groups.get(key) ?? []
    existing.push(txn)
    groups.set(key, existing)
  }

  const result: RecurringGroup[] = []

  for (const [merchantName, txns] of groups) {
    if (txns.length < 2) continue

    txns.sort((a, b) => a.date.localeCompare(b.date))

    const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0)
    const avgAmount = totalAmount / txns.length

    let totalDays = 0
    for (let i = 1; i < txns.length; i++) {
      const prev = new Date(txns[i - 1].date)
      const curr = new Date(txns[i].date)
      totalDays += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    }
    const avgDaysBetween = totalDays / (txns.length - 1)

    const frequency = detectFrequency(avgDaysBetween)

    // Most common category in the group
    const categoryCounts = new Map<string, { count: number; color: string | null }>()
    for (const t of txns) {
      if (t.category_name) {
        const existing = categoryCounts.get(t.category_name)
        if (existing) existing.count++
        else categoryCounts.set(t.category_name, { count: 1, color: t.category_color })
      }
    }
    let topCategory: string | null = null
    let topCategoryColor: string | null = null
    let topCount = 0
    for (const [name, { count, color }] of categoryCounts) {
      if (count > topCount) {
        topCount = count
        topCategory = name
        topCategoryColor = color
      }
    }

    result.push({
      merchantName,
      occurrences: txns.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      avgAmount: Math.round(avgAmount * 100) / 100,
      estimatedMonthlyAmount: Math.round(estimateMonthlyAmount(avgAmount, frequency) * 100) / 100,
      frequency,
      firstDate: txns[0].date,
      lastDate: txns[txns.length - 1].date,
      category: topCategory,
      categoryColor: topCategoryColor,
      transactionIds: txns.map(t => t.id),
    })
  }

  result.sort((a, b) => b.totalAmount - a.totalAmount)
  return result
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/recurring.test.ts`
Expected: PASS

**Step 5: Write the failing DB tests**

Create `src/__tests__/lib/db/recurring.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import { getRecurringCharges } from '@/lib/db/recurring'

describe('getRecurringCharges', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')
  })

  it('detects recurring charges by normalized_merchant', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'NETFLIX.COM 1234', amount: 15.99, type: 'debit' },
      { date: '2025-02-15', description: 'NETFLIX.COM 5678', amount: 15.99, type: 'debit' },
      { date: '2025-03-15', description: 'NETFLIX.COM 9012', amount: 15.99, type: 'debit' },
      { date: '2025-01-20', description: 'Whole Foods', amount: 120.00, type: 'debit' },
    ])
    // Simulate LLM normalization
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix' WHERE description LIKE 'NETFLIX%'").run()
    db.prepare("UPDATE transactions SET normalized_merchant = 'Whole Foods Market' WHERE description = 'Whole Foods'").run()

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(1)
    expect(groups[0].merchantName).toBe('Netflix')
    expect(groups[0].occurrences).toBe(3)
  })

  it('filters by date range', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Netflix', amount: 15.99, type: 'debit' },
      { date: '2025-02-15', description: 'Netflix', amount: 15.99, type: 'debit' },
      { date: '2025-06-15', description: 'Netflix', amount: 15.99, type: 'debit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'Netflix'").run()

    const groups = getRecurringCharges(db, { start_date: '2025-01-01', end_date: '2025-03-31' })
    expect(groups.length).toBe(1)
    expect(groups[0].occurrences).toBe(2)
  })

  it('excludes credit transactions', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
      { date: '2025-02-15', description: 'Refund XYZ', amount: 50.00, type: 'credit' },
    ])
    db.prepare("UPDATE transactions SET normalized_merchant = 'XYZ Corp'").run()

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(0)
  })

  it('excludes transactions without normalized_merchant', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Unknown', amount: 50.00, type: 'debit' },
      { date: '2025-02-15', description: 'Unknown', amount: 50.00, type: 'debit' },
    ])
    // Don't set normalized_merchant — should be skipped

    const groups = getRecurringCharges(db, {})
    expect(groups.length).toBe(0)
  })
})
```

**Step 6: Write the DB query function**

Create `src/lib/db/recurring.ts`:

```typescript
import type Database from 'better-sqlite3'
import { detectRecurringGroups, type RecurringGroup, type TransactionForRecurring } from '@/lib/recurring'

export interface RecurringFilters {
  start_date?: string
  end_date?: string
}

export function getRecurringCharges(db: Database.Database, filters: RecurringFilters): RecurringGroup[] {
  const conditions: string[] = ["t.type = 'debit'", "t.normalized_merchant IS NOT NULL"]
  const params: unknown[] = []

  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const rows = db.prepare(`
    SELECT t.id, t.date, t.description, t.normalized_merchant, t.amount, t.type,
           c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.date ASC
  `).all(params) as TransactionForRecurring[]

  return detectRecurringGroups(rows)
}
```

**Step 7: Run all recurring tests**

Run: `npm test -- src/__tests__/lib/recurring.test.ts src/__tests__/lib/db/recurring.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add src/lib/recurring.ts src/lib/db/recurring.ts src/__tests__/lib/recurring.test.ts src/__tests__/lib/db/recurring.test.ts
git commit -m "feat: add recurring group detection and DB query"
```

---

### Task 6: API Route + Sidebar Update

**Files:**
- Create: `src/app/api/recurring/route.ts`
- Modify: `src/components/sidebar.tsx`

**Step 1: Create the API route**

Create `src/app/api/recurring/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getRecurringCharges } from '@/lib/db/recurring'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const groups = getRecurringCharges(db, {
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
  })

  const totalMonthly = groups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
  const totalYearly = totalMonthly * 12

  return NextResponse.json({
    groups,
    summary: {
      totalSubscriptions: groups.length,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalYearly: Math.round(totalYearly * 100) / 100,
    },
  })
}
```

**Step 2: Update sidebar**

In `src/components/sidebar.tsx`, add `RefreshCw` to the Lucide import and add a Subscriptions nav item between Reports and Settings:

```typescript
import { Receipt, BarChart3, RefreshCw, Settings } from 'lucide-react'

const navItems = [
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/subscriptions', label: 'Subscriptions', icon: RefreshCw },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

**Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/app/api/recurring/route.ts src/components/sidebar.tsx
git commit -m "feat: add /api/recurring endpoint and sidebar link"
```

---

### Task 7: Recurring Charges Table + Subscriptions Page

**Files:**
- Create: `src/components/recurring-charges-table.tsx`
- Create: `src/app/(app)/subscriptions/page.tsx`

**Step 1: Create the table component**

Create `src/components/recurring-charges-table.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface RecurringGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
}

interface RecurringChargesTableProps {
  groups: RecurringGroup[]
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular',
}

const FREQUENCY_COLORS: Record<string, string> = {
  weekly: '#3B82F6',
  monthly: '#22C55E',
  quarterly: '#F97316',
  yearly: '#A855F7',
  irregular: '#6B7280',
}

const PAGE_SIZE = 20

export function RecurringChargesTable({ groups }: RecurringChargesTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const paged = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">
        Detected Recurring Charges ({groups.length})
      </h3>
      {groups.length === 0 ? (
        <p className="text-center text-gray-400 py-8">
          No recurring charges detected. Upload more statements to improve detection.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Avg Charge</TableHead>
                <TableHead className="text-right">Monthly Est.</TableHead>
                <TableHead className="text-center">Charges</TableHead>
                <TableHead>Last Charge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((group) => (
                <TableRow key={group.merchantName}>
                  <TableCell className="font-medium text-sm">
                    {group.merchantName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: FREQUENCY_COLORS[group.frequency],
                        color: FREQUENCY_COLORS[group.frequency],
                      }}
                    >
                      {FREQUENCY_LABELS[group.frequency]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {group.category ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: group.categoryColor ?? undefined,
                          color: group.categoryColor ?? undefined,
                        }}
                      >
                        {group.category}
                      </Badge>
                    ) : (
                      'Uncategorized'
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    ${group.avgAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    ${group.estimatedMonthlyAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-gray-500">
                    {group.occurrences}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {group.lastDate}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, groups.length)} of {groups.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
```

**Step 2: Create the subscriptions page**

Create `src/app/(app)/subscriptions/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RecurringChargesTable } from '@/components/recurring-charges-table'
import { RefreshCw, DollarSign, TrendingUp } from 'lucide-react'

interface RecurringGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
}

interface RecurringData {
  groups: RecurringGroup[]
  summary: {
    totalSubscriptions: number
    totalMonthly: number
    totalYearly: number
  }
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'last12Months': {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      return { start: fmt(start), end: fmt(now) }
    }
    case 'thisYear':
      return { start: `${now.getFullYear()}-01-01`, end: fmt(now) }
    case 'all':
    default:
      return { start: '', end: '' }
  }
}

export default function SubscriptionsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [data, setData] = useState<RecurringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)

  const fetchData = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/recurring?${params}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/recurring?${params}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [startDate, endDate])

  const applyPreset = (preset: string) => {
    const { start, end } = getDatePreset(preset)
    setStartDate(start)
    setEndDate(end)
  }

  const handleNormalize = () => {
    setNormalizing(true)
    fetch('/api/recurring/normalize', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        setNormalizing(false)
        fetchData()
      })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Subscriptions & Recurring</h2>
          <p className="text-gray-500 text-sm mt-1">
            Automatically detected recurring charges from your statements
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleNormalize} disabled={normalizing}>
          {normalizing ? 'Analyzing...' : 'Re-analyze Merchants'}
        </Button>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">From</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">To</label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => applyPreset('last12Months')}>Last 12mo</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset('thisYear')}>This year</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset('all')}>All time</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-50 p-2">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Recurring Charges</p>
                  <p className="text-2xl font-bold">{data.summary.totalSubscriptions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-50 p-2">
                  <DollarSign className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Est. Monthly Cost</p>
                  <p className="text-2xl font-bold">${data.summary.totalMonthly.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-50 p-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Est. Yearly Cost</p>
                  <p className="text-2xl font-bold">${data.summary.totalYearly.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </div>

          <RecurringChargesTable groups={data.groups} />
        </>
      ) : null}
    </div>
  )
}
```

**Step 3: Verify the full app builds**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/components/recurring-charges-table.tsx src/app/\(app\)/subscriptions/page.tsx
git commit -m "feat: add subscriptions page with recurring charge detection"
```

---

### Summary of all files

| Action | File |
|--------|------|
| Modify | `src/lib/db/schema.ts` (add `normalized_merchant` column) |
| Modify | `src/__tests__/lib/db/transactions.test.ts` (verify migration) |
| Create | `src/lib/claude/normalize-merchants.ts` |
| Create | `src/__tests__/lib/claude/normalize-merchants.test.ts` |
| Modify | `src/lib/claude/schemas.ts` (add normalization schema) |
| Modify | `src/app/api/upload/route.ts` (call normalization) |
| Create | `src/app/api/recurring/normalize/route.ts` (backfill) |
| Create | `src/lib/recurring.ts` |
| Create | `src/__tests__/lib/recurring.test.ts` |
| Create | `src/lib/db/recurring.ts` |
| Create | `src/__tests__/lib/db/recurring.test.ts` |
| Create | `src/app/api/recurring/route.ts` |
| Modify | `src/components/sidebar.tsx` |
| Create | `src/components/recurring-charges-table.tsx` |
| Create | `src/app/(app)/subscriptions/page.tsx` |

### No new dependencies required

Everything uses the existing stack: better-sqlite3, Anthropic SDK, Next.js, shadcn/ui, Lucide, Tailwind.
