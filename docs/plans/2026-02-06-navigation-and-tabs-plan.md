# Navigation & Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sidebar navigation with Transactions (browse, filter, delete), Reports (dashboard with charts), and Settings (stub) tabs.

**Architecture:** URL-based routing via Next.js App Router route group `(app)`. Sidebar layout wraps all tabbed pages. DB-level aggregation queries power the reports dashboard. Recharts for visualizations.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui (new-york style), better-sqlite3, Recharts, Vitest

**Design doc:** `docs/plans/2026-02-06-navigation-and-tabs-design.md`

---

### Task 1: Install Dependencies & shadcn Components

**Files:**
- Modify: `package.json`
- Create: `src/components/ui/checkbox.tsx` (via shadcn CLI)
- Create: `src/components/ui/dialog.tsx` (via shadcn CLI)
- Create: `src/components/ui/popover.tsx` (via shadcn CLI)

**Step 1: Install recharts**

Run: `npm install recharts`

**Step 2: Add shadcn checkbox, dialog, and popover components**

Run: `npx shadcn@latest add checkbox dialog popover`

These are needed for: multi-select in transaction table (checkbox), delete confirmation (dialog), category multi-select filter (popover + checkbox).

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/checkbox.tsx src/components/ui/dialog.tsx src/components/ui/popover.tsx
git commit -m "chore: add recharts, shadcn checkbox, dialog, and popover"
```

---

### Task 2: DB — Delete Functions & Extended Filters (TDD)

**Files:**
- Modify: `src/lib/db/transactions.ts`
- Modify: `src/__tests__/lib/db/transactions.test.ts`

**Step 1: Write failing tests for delete functions**

Add to the bottom of `src/__tests__/lib/db/transactions.test.ts`:

```typescript
it('deletes a single transaction', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    { date: '2025-01-16', description: 'Cafe', amount: 10, type: 'debit' },
  ])
  const txns = listTransactions(db, {})
  deleteTransaction(db, txns.transactions[0].id)
  const result = listTransactions(db, {})
  expect(result.total).toBe(1)
  expect(result.transactions[0].description).toBe('Store')
})

it('bulk deletes multiple transactions', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
    { date: '2025-01-16', description: 'B', amount: 20, type: 'debit' },
    { date: '2025-01-17', description: 'C', amount: 30, type: 'debit' },
  ])
  const txns = listTransactions(db, {})
  const idsToDelete = txns.transactions.filter(t => t.description !== 'B').map(t => t.id)
  const deleted = deleteTransactions(db, idsToDelete)
  expect(deleted).toBe(2)
  const result = listTransactions(db, {})
  expect(result.total).toBe(1)
  expect(result.transactions[0].description).toBe('B')
})

it('returns 0 when deleting empty array', () => {
  const deleted = deleteTransactions(db, [])
  expect(deleted).toBe(0)
})
```

Update the import line at the top of the test file to include the new functions:

```typescript
import { insertTransactions, listTransactions, updateTransactionCategory, findDuplicateTransaction, bulkUpdateCategories, deleteTransaction, deleteTransactions } from '@/lib/db/transactions'
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: 3 new tests FAIL (functions not exported)

**Step 3: Implement delete functions**

Add to the bottom of `src/lib/db/transactions.ts`:

```typescript
export function deleteTransaction(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
}

export function deleteTransactions(db: Database.Database, ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const result = db.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...ids)
  return result.changes
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: All tests PASS

**Step 5: Write failing tests for extended list filters**

The existing `listTransactions` needs `start_date`, `end_date`, `document_id`, and `category_ids` (array) support. Add tests:

```typescript
it('filters by date range', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-10', description: 'Early', amount: 10, type: 'debit' },
    { date: '2025-02-15', description: 'Mid', amount: 20, type: 'debit' },
    { date: '2025-03-20', description: 'Late', amount: 30, type: 'debit' },
  ])
  const result = listTransactions(db, { start_date: '2025-02-01', end_date: '2025-02-28' })
  expect(result.total).toBe(1)
  expect(result.transactions[0].description).toBe('Mid')
})

it('filters by document_id', () => {
  const docId2 = createDocument(db, 'other.pdf', '/path/other.pdf')
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Doc1', amount: 10, type: 'debit' },
  ])
  insertTransactions(db, docId2, [
    { date: '2025-01-16', description: 'Doc2', amount: 20, type: 'debit' },
  ])
  const result = listTransactions(db, { document_id: docId2 })
  expect(result.total).toBe(1)
  expect(result.transactions[0].description).toBe('Doc2')
})

it('filters by multiple category_ids', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
    { date: '2025-01-16', description: 'B', amount: 20, type: 'debit' },
    { date: '2025-01-17', description: 'C', amount: 30, type: 'debit' },
  ])
  const categories = getAllCategories(db)
  const groceries = categories.find(c => c.name === 'Groceries')!
  const shopping = categories.find(c => c.name === 'Shopping')!
  const txns = listTransactions(db, {})
  updateTransactionCategory(db, txns.transactions[0].id, groceries.id)
  updateTransactionCategory(db, txns.transactions[1].id, shopping.id)

  const result = listTransactions(db, { category_ids: [groceries.id, shopping.id] })
  expect(result.total).toBe(2)
})
```

**Step 6: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: 3 new tests FAIL

**Step 7: Extend ListFilters and listTransactions**

Update the `ListFilters` interface in `src/lib/db/transactions.ts`:

```typescript
export interface ListFilters {
  type?: 'debit' | 'credit'
  category_id?: number
  category_ids?: number[]
  search?: string
  start_date?: string
  end_date?: string
  document_id?: number
  sort_by?: 'date' | 'amount' | 'description'
  sort_order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
```

Add these conditions inside `listTransactions`, after the existing `filters.search` block:

```typescript
if (filters.start_date) {
  conditions.push('t.date >= ?')
  params.push(filters.start_date)
}
if (filters.end_date) {
  conditions.push('t.date <= ?')
  params.push(filters.end_date)
}
if (filters.document_id !== undefined) {
  conditions.push('t.document_id = ?')
  params.push(filters.document_id)
}
if (filters.category_ids && filters.category_ids.length > 0) {
  const placeholders = filters.category_ids.map(() => '?').join(', ')
  conditions.push(`t.category_id IN (${placeholders})`)
  params.push(...filters.category_ids)
}
```

**Step 8: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add src/lib/db/transactions.ts src/__tests__/lib/db/transactions.test.ts
git commit -m "feat: add delete functions and extended list filters to transactions"
```

---

### Task 3: DB — List Documents Function (TDD)

**Files:**
- Modify: `src/lib/db/documents.ts`
- Modify: `src/__tests__/lib/db/documents.test.ts`

**Step 1: Write failing test**

Add to `src/__tests__/lib/db/documents.test.ts`:

```typescript
import { createDocument, getDocument, updateDocumentStatus, findDocumentByHash, updateDocumentType, listDocuments } from '@/lib/db/documents'
```

(Update the import at the top to include `listDocuments`)

Add test:

```typescript
it('lists all documents ordered by upload date desc', () => {
  createDocument(db, 'first.pdf', '/data/first.pdf', 'hash1')
  createDocument(db, 'second.pdf', '/data/second.pdf', 'hash2')
  const docs = listDocuments(db)
  expect(docs).toHaveLength(2)
  expect(docs[0].filename).toBe('second.pdf')
  expect(docs[1].filename).toBe('first.pdf')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: FAIL (listDocuments not exported)

**Step 3: Implement listDocuments**

Add to `src/lib/db/documents.ts`:

```typescript
export function listDocuments(db: Database.Database): Document[] {
  return db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all() as Document[]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/db/documents.ts src/__tests__/lib/db/documents.test.ts
git commit -m "feat: add listDocuments function"
```

---

### Task 4: DB — Reports Aggregation Queries (TDD)

**Files:**
- Create: `src/lib/db/reports.ts`
- Create: `src/__tests__/lib/db/reports.test.ts`

**Step 1: Write failing tests**

Create `src/__tests__/lib/db/reports.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions, updateTransactionCategory } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'
import {
  getSpendingSummary,
  getSpendingOverTime,
  getCategoryBreakdown,
  getSpendingTrend,
  getTopTransactions,
} from '@/lib/db/reports'
import type { ReportFilters } from '@/lib/db/reports'

describe('reports', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')

    // Seed data across multiple months
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Groceries', amount: 100, type: 'debit' },
      { date: '2025-01-20', description: 'Salary', amount: 3000, type: 'credit' },
      { date: '2025-02-10', description: 'Restaurant', amount: 50, type: 'debit' },
      { date: '2025-02-15', description: 'Utilities', amount: 200, type: 'debit' },
      { date: '2025-03-05', description: 'Shopping', amount: 75, type: 'debit' },
    ])

    // Assign categories
    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const dining = categories.find(c => c.name === 'Restaurants & Dining')!
    const utilities = categories.find(c => c.name === 'Utilities')!
    const shopping = categories.find(c => c.name === 'Shopping')!
    const income = categories.find(c => c.name === 'Income')!

    // Get transaction IDs (ordered by date DESC: Mar, Feb-utils, Feb-rest, Jan-salary, Jan-groc)
    const all = db.prepare('SELECT id, description FROM transactions ORDER BY date ASC').all() as Array<{ id: number; description: string }>
    updateTransactionCategory(db, all.find(t => t.description === 'Groceries')!.id, groceries.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Salary')!.id, income.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Restaurant')!.id, dining.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Utilities')!.id, utilities.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Shopping')!.id, shopping.id)
  })

  describe('getSpendingSummary', () => {
    it('computes totals for all data', () => {
      const summary = getSpendingSummary(db, {})
      expect(summary.totalSpent).toBe(425)    // 100 + 50 + 200 + 75
      expect(summary.totalIncome).toBe(3000)
      expect(summary.topCategory.name).toBe('Utilities')
      expect(summary.topCategory.amount).toBe(200)
    })

    it('filters by date range', () => {
      const summary = getSpendingSummary(db, { start_date: '2025-02-01', end_date: '2025-02-28' })
      expect(summary.totalSpent).toBe(250)    // 50 + 200
      expect(summary.totalIncome).toBe(0)
    })

    it('computes average monthly spend', () => {
      const summary = getSpendingSummary(db, {})
      // 3 months of data (Jan, Feb, Mar), total debits = 425
      expect(summary.avgMonthly).toBeCloseTo(141.67, 1)
    })
  })

  describe('getSpendingOverTime', () => {
    it('groups by month', () => {
      const data = getSpendingOverTime(db, {}, 'month')
      expect(data).toHaveLength(3)
      expect(data[0]).toEqual({ period: '2025-01', amount: 100 })
      expect(data[1]).toEqual({ period: '2025-02', amount: 250 })
      expect(data[2]).toEqual({ period: '2025-03', amount: 75 })
    })

    it('filters by type debit only (default for spending)', () => {
      const data = getSpendingOverTime(db, { type: 'debit' }, 'month')
      // Should exclude the credit (salary)
      expect(data).toHaveLength(3)
      expect(data[0].amount).toBe(100)
    })
  })

  describe('getCategoryBreakdown', () => {
    it('returns category totals for debits', () => {
      const data = getCategoryBreakdown(db, {})
      expect(data.length).toBeGreaterThanOrEqual(4)
      const utilities = data.find(d => d.category === 'Utilities')
      expect(utilities).toBeDefined()
      expect(utilities!.amount).toBe(200)
      // Check percentages sum to ~100
      const totalPct = data.reduce((sum, d) => sum + d.percentage, 0)
      expect(totalPct).toBeCloseTo(100, 0)
    })
  })

  describe('getSpendingTrend', () => {
    it('returns monthly debits and credits', () => {
      const data = getSpendingTrend(db, {})
      expect(data).toHaveLength(3)
      expect(data[0]).toEqual({ period: '2025-01', debits: 100, credits: 3000 })
      expect(data[1]).toEqual({ period: '2025-02', debits: 250, credits: 0 })
      expect(data[2]).toEqual({ period: '2025-03', debits: 75, credits: 0 })
    })
  })

  describe('getTopTransactions', () => {
    it('returns top N transactions by amount descending', () => {
      const data = getTopTransactions(db, {}, 3)
      expect(data).toHaveLength(3)
      expect(data[0].amount).toBe(3000) // Salary
      expect(data[1].amount).toBe(200)  // Utilities
      expect(data[2].amount).toBe(100)  // Groceries
    })

    it('filters by date range', () => {
      const data = getTopTransactions(db, { start_date: '2025-02-01', end_date: '2025-03-31' }, 10)
      expect(data).toHaveLength(3) // Restaurant, Utilities, Shopping
      expect(data[0].amount).toBe(200)
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement reports.ts**

Create `src/lib/db/reports.ts`:

```typescript
import type Database from 'better-sqlite3'

export interface ReportFilters {
  start_date?: string
  end_date?: string
  category_ids?: number[]
  type?: 'debit' | 'credit'
  document_id?: number
}

interface SpendingSummary {
  totalSpent: number
  totalIncome: number
  avgMonthly: number
  topCategory: { name: string; amount: number }
}

interface SpendingOverTimeRow {
  period: string
  amount: number
}

interface CategoryBreakdownRow {
  category: string
  color: string
  amount: number
  percentage: number
}

interface SpendingTrendRow {
  period: string
  debits: number
  credits: number
}

interface TopTransactionRow {
  id: number
  date: string
  description: string
  amount: number
  type: string
  category: string | null
}

function buildWhere(filters: ReportFilters): { where: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
  }
  if (filters.type) {
    conditions.push('t.type = ?')
    params.push(filters.type)
  }
  if (filters.document_id !== undefined) {
    conditions.push('t.document_id = ?')
    params.push(filters.document_id)
  }
  if (filters.category_ids && filters.category_ids.length > 0) {
    const placeholders = filters.category_ids.map(() => '?').join(', ')
    conditions.push(`t.category_id IN (${placeholders})`)
    params.push(...filters.category_ids)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

export function getSpendingSummary(db: Database.Database, filters: ReportFilters): SpendingSummary {
  const { where, params } = buildWhere(filters)

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as totalSpent,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as totalIncome
    FROM transactions t
    ${where}
  `).get(params) as { totalSpent: number; totalIncome: number }

  const monthCount = db.prepare(`
    SELECT COUNT(DISTINCT strftime('%Y-%m', t.date)) as months
    FROM transactions t
    ${where}
  `).get(params) as { months: number }

  const avgMonthly = monthCount.months > 0
    ? Math.round((totals.totalSpent / monthCount.months) * 100) / 100
    : 0

  const topCat = db.prepare(`
    SELECT c.name, SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where ? where + " AND t.type = 'debit'" : "WHERE t.type = 'debit'"}
    GROUP BY t.category_id
    ORDER BY amount DESC
    LIMIT 1
  `).get(params) as { name: string; amount: number } | undefined

  return {
    totalSpent: totals.totalSpent,
    totalIncome: totals.totalIncome,
    avgMonthly,
    topCategory: topCat ?? { name: 'None', amount: 0 },
  }
}

export function getSpendingOverTime(
  db: Database.Database,
  filters: ReportFilters,
  groupBy: 'month' | 'quarter' | 'year'
): SpendingOverTimeRow[] {
  const debitFilters = { ...filters, type: filters.type ?? 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  let periodExpr: string
  switch (groupBy) {
    case 'month':
      periodExpr = "strftime('%Y-%m', t.date)"
      break
    case 'quarter':
      periodExpr = "strftime('%Y', t.date) || '-Q' || ((cast(strftime('%m', t.date) as integer) - 1) / 3 + 1)"
      break
    case 'year':
      periodExpr = "strftime('%Y', t.date)"
      break
  }

  return db.prepare(`
    SELECT ${periodExpr} as period, SUM(t.amount) as amount
    FROM transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingOverTimeRow[]
}

export function getCategoryBreakdown(db: Database.Database, filters: ReportFilters): CategoryBreakdownRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  const rows = db.prepare(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category,
      COALESCE(c.color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    GROUP BY t.category_id
    ORDER BY amount DESC
  `).all(params) as Array<{ category: string; color: string; amount: number }>

  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return rows.map(r => ({
    ...r,
    percentage: total > 0 ? Math.round((r.amount / total) * 10000) / 100 : 0,
  }))
}

export function getSpendingTrend(db: Database.Database, filters: ReportFilters): SpendingTrendRow[] {
  // Don't pass type filter — we need both debits and credits
  const { type: _type, ...filtersWithoutType } = filters
  const { where, params } = buildWhere(filtersWithoutType)

  return db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as debits,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as credits
    FROM transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingTrendRow[]
}

export function getTopTransactions(
  db: Database.Database,
  filters: ReportFilters,
  limit: number = 10
): TopTransactionRow[] {
  const { where, params } = buildWhere(filters)

  return db.prepare(`
    SELECT t.id, t.date, t.description, t.amount, t.type,
           c.name as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    ORDER BY t.amount DESC
    LIMIT ?
  `).all([...params, limit]) as TopTransactionRow[]
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/db/reports.ts src/__tests__/lib/db/reports.test.ts
git commit -m "feat: add reports aggregation queries with TDD"
```

---

### Task 5: API Routes — Delete Endpoints, Documents List, Reports

**Files:**
- Modify: `src/app/api/transactions/[id]/route.ts`
- Modify: `src/app/api/transactions/route.ts`
- Create: `src/app/api/documents/route.ts`
- Create: `src/app/api/reports/route.ts`

**Step 1: Add DELETE handler to transactions/[id]/route.ts**

Add to `src/app/api/transactions/[id]/route.ts` (after the existing PATCH handler):

```typescript
import { deleteTransaction } from '@/lib/db/transactions'
```

(Add `deleteTransaction` to the existing import from `@/lib/db/transactions`)

```typescript
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  deleteTransaction(db, Number(id))
  return new NextResponse(null, { status: 204 })
}
```

**Step 2: Add DELETE handler to transactions/route.ts**

Add to `src/app/api/transactions/route.ts`:

```typescript
import { listTransactions, deleteTransactions } from '@/lib/db/transactions'
```

(Add `deleteTransactions` to the existing import)

Add the DELETE handler:

```typescript
export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const ids: number[] = body.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const db = getDb()
  const deleted = deleteTransactions(db, ids)
  return NextResponse.json({ deleted })
}
```

Also update the GET handler to support the new filter params (`start_date`, `end_date`, `document_id`, `category_ids`):

```typescript
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const result = listTransactions(db, {
    type: (params.get('type') as 'debit' | 'credit') || undefined,
    category_id: params.get('category_id') ? Number(params.get('category_id')) : undefined,
    category_ids: params.get('category_ids') ? params.get('category_ids')!.split(',').map(Number) : undefined,
    search: params.get('search') || undefined,
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
    document_id: params.get('document_id') ? Number(params.get('document_id')) : undefined,
    sort_by: (params.get('sort_by') as 'date' | 'amount' | 'description') || undefined,
    sort_order: (params.get('sort_order') as 'asc' | 'desc') || undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })

  return NextResponse.json(result)
}
```

**Step 3: Create documents list API**

Create `src/app/api/documents/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listDocuments } from '@/lib/db/documents'

export async function GET() {
  const db = getDb()
  const documents = listDocuments(db)
  return NextResponse.json(documents)
}
```

**Step 4: Create reports API**

Create `src/app/api/reports/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  getSpendingSummary,
  getSpendingOverTime,
  getCategoryBreakdown,
  getSpendingTrend,
  getTopTransactions,
} from '@/lib/db/reports'
import type { ReportFilters } from '@/lib/db/reports'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const filters: ReportFilters = {
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
    type: (params.get('type') as 'debit' | 'credit') || undefined,
    document_id: params.get('document_id') ? Number(params.get('document_id')) : undefined,
    category_ids: params.get('category_ids') ? params.get('category_ids')!.split(',').map(Number) : undefined,
  }

  const groupBy = (params.get('group_by') as 'month' | 'quarter' | 'year') || 'month'

  const summary = getSpendingSummary(db, filters)
  const spendingOverTime = getSpendingOverTime(db, filters, groupBy)
  const categoryBreakdown = getCategoryBreakdown(db, filters)
  const trend = getSpendingTrend(db, filters)
  const topTransactions = getTopTransactions(db, filters, 10)

  return NextResponse.json({
    summary,
    spendingOverTime,
    categoryBreakdown,
    trend,
    topTransactions,
  })
}
```

**Step 5: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/app/api/transactions/route.ts src/app/api/transactions/\[id\]/route.ts src/app/api/documents/route.ts src/app/api/reports/route.ts
git commit -m "feat: add delete, documents list, and reports API routes"
```

---

### Task 6: Sidebar Component & Route Group Layout

**Files:**
- Create: `src/components/sidebar.tsx`
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/page.tsx` (redirect)

**Step 1: Create sidebar component**

Create `src/components/sidebar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Receipt, BarChart3, Settings } from 'lucide-react'

const navItems = [
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white max-md:w-16">
      <div className="border-b px-6 py-4 max-md:px-2 max-md:py-3">
        <Link href="/transactions">
          <h1 className="text-xl font-bold max-md:hidden">Expenlytics</h1>
          <span className="hidden text-xl font-bold max-md:block">E</span>
        </Link>
        <p className="text-xs text-gray-500 max-md:hidden">Local-first spending analytics</p>
      </div>
      <nav className="flex-1 p-4 space-y-1 max-md:p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors max-md:justify-center max-md:px-2',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-md:hidden">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

**Step 2: Create route group layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { Sidebar } from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
```

**Step 3: Update root page to redirect**

Replace `src/app/page.tsx` entirely:

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/transactions')
}
```

**Step 4: Verify the app loads**

Run: `npm run build`
Expected: Build succeeds. (We'll create the tab pages next, so the redirect target doesn't exist yet — that's fine, we'll add it in the next task.)

Note: Build may warn about missing `/transactions` page. That's OK — we create it in Task 7.

**Step 5: Commit**

```bash
git add src/components/sidebar.tsx src/app/\(app\)/layout.tsx src/app/page.tsx
git commit -m "feat: add sidebar navigation and route group layout"
```

---

### Task 7: Transactions Page with Filter Bar

**Files:**
- Create: `src/app/(app)/transactions/page.tsx`
- Create: `src/components/filter-bar.tsx`

**Step 1: Create the filter bar component**

Create `src/components/filter-bar.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'

interface Category {
  id: number
  name: string
  color: string
}

interface Document {
  id: number
  filename: string
}

export interface Filters {
  search: string
  type: '' | 'debit' | 'credit'
  start_date: string
  end_date: string
  category_ids: number[]
  document_id: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  start_date: '',
  end_date: '',
  category_ids: [],
  document_id: '',
}

interface FilterBarProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  switch (preset) {
    case 'last30': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case 'thisMonth':
      return { start: `${yyyy}-${mm}-01`, end: today }
    case 'last3Months': {
      const d = new Date(yyyy, now.getMonth() - 2, 1)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case 'thisYear':
      return { start: `${yyyy}-01-01`, end: today }
    default:
      return { start: '', end: '' }
  }
}

function hasActiveFilters(filters: Filters): boolean {
  return filters.search !== '' || filters.type !== '' || filters.start_date !== '' || filters.end_date !== '' || filters.category_ids.length > 0 || filters.document_id !== ''
}

export { EMPTY_FILTERS, hasActiveFilters }

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [documents, setDocuments] = useState<Document[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    })
    fetch('/api/documents').then(r => r.json()).then(data => {
      if (!cancelled) setDocuments(data)
    })
    return () => { cancelled = true }
  }, [])

  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial })
  }

  const applyPreset = (preset: string) => {
    const { start, end } = getDatePreset(preset)
    update({ start_date: start, end_date: end })
  }

  const toggleCategory = (id: number) => {
    const ids = filters.category_ids.includes(id)
      ? filters.category_ids.filter(c => c !== id)
      : [...filters.category_ids, id]
    update({ category_ids: ids })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="w-56"
        />

        {/* Type */}
        <Select value={filters.type || 'all'} onValueChange={(v) => update({ type: v === 'all' ? '' : v as 'debit' | 'credit' })}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="debit">Debits</SelectItem>
            <SelectItem value="credit">Credits</SelectItem>
          </SelectContent>
        </Select>

        {/* Category multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-44 justify-start">
              {filters.category_ids.length > 0
                ? `${filters.category_ids.length} categories`
                : 'All categories'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 max-h-64 overflow-auto p-2" align="start">
            {categories.map(cat => (
              <label key={cat.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 cursor-pointer">
                <Checkbox
                  checked={filters.category_ids.includes(cat.id)}
                  onCheckedChange={() => toggleCategory(cat.id)}
                />
                <span className="text-sm" style={{ color: cat.color }}>{cat.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Source document */}
        <Select value={filters.document_id || 'all'} onValueChange={(v) => update({ document_id: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All files" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All files</SelectItem>
            {documents.map(doc => (
              <SelectItem key={doc.id} value={doc.id.toString()}>{doc.filename}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Date range row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">From</span>
          <Input
            type="date"
            value={filters.start_date}
            onChange={(e) => update({ start_date: e.target.value })}
            className="w-36 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">To</span>
          <Input
            type="date"
            value={filters.end_date}
            onChange={(e) => update({ end_date: e.target.value })}
            className="w-36 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {[
            { label: 'Last 30d', value: 'last30' },
            { label: 'This month', value: 'thisMonth' },
            { label: 'Last 3mo', value: 'last3Months' },
            { label: 'This year', value: 'thisYear' },
            { label: 'All time', value: 'all' },
          ].map(p => (
            <Button key={p.value} variant="outline" size="sm" onClick={() => {
              if (p.value === 'all') { update({ start_date: '', end_date: '' }) }
              else { applyPreset(p.value) }
            }}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Create the transactions page**

Create `src/app/(app)/transactions/page.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { TransactionTable } from '@/components/transaction-table'
import { FilterBar, EMPTY_FILTERS, type Filters } from '@/components/filter-bar'

export default function TransactionsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const handleUploadComplete = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Transactions</h2>
        <p className="text-sm text-gray-500">Manage your imported transactions</p>
      </div>
      <UploadZone onUploadComplete={handleUploadComplete} />
      <FilterBar filters={filters} onFiltersChange={setFilters} />
      <TransactionTable refreshKey={refreshKey} filters={filters} />
    </div>
  )
}
```

Note: The `TransactionTable` component will need to accept a `filters` prop — that's handled in the next task.

**Step 3: Commit**

```bash
git add src/components/filter-bar.tsx src/app/\(app\)/transactions/page.tsx
git commit -m "feat: add transactions page with filter bar"
```

---

### Task 8: Enhanced Transaction Table — Checkboxes, Delete, Pagination

**Files:**
- Modify: `src/components/transaction-table.tsx` (major rewrite)

**Step 1: Rewrite transaction-table.tsx**

Replace `src/components/transaction-table.tsx` entirely with:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoryBadge } from './category-badge'
import { CategorySelect } from './category-select'
import { Trash2 } from 'lucide-react'
import type { Filters } from '@/components/filter-bar'

interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
}

interface Category {
  id: number
  name: string
  color: string
}

interface TransactionTableProps {
  refreshKey: number
  filters?: Filters
}

const PAGE_SIZE = 50

export function TransactionTable({ refreshKey, filters }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'single' | 'bulk'; ids: number[] } | null>(null)
  const refreshRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [filters, refreshKey])

  useEffect(() => {
    let cancelled = false
    refreshRef.current++
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.type) params.set('type', filters.type)
    if (filters?.start_date) params.set('start_date', filters.start_date)
    if (filters?.end_date) params.set('end_date', filters.end_date)
    if (filters?.document_id) params.set('document_id', filters.document_id)
    if (filters?.category_ids && filters.category_ids.length > 0) {
      params.set('category_ids', filters.category_ids.join(','))
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))

    fetch(`/api/transactions?${params}`).then(r => r.json()).then(data => {
      if (!cancelled) {
        setTransactions(data.transactions)
        setTotal(data.total)
      }
    })
    return () => { cancelled = true }
  }, [filters, refreshKey, page])

  const updateCategory = async (transactionId: number, categoryId: number) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    })
    refreshRef.current++
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.type) params.set('type', filters.type)
    if (filters?.start_date) params.set('start_date', filters.start_date)
    if (filters?.end_date) params.set('end_date', filters.end_date)
    if (filters?.document_id) params.set('document_id', filters.document_id)
    if (filters?.category_ids && filters.category_ids.length > 0) {
      params.set('category_ids', filters.category_ids.join(','))
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    const data = await fetch(`/api/transactions?${params}`).then(r => r.json())
    setTransactions(data.transactions)
    setTotal(data.total)
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return
    if (deleteDialog.type === 'single') {
      await fetch(`/api/transactions/${deleteDialog.ids[0]}`, { method: 'DELETE' })
    } else {
      await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: deleteDialog.ids }),
      })
    }
    setDeleteDialog(null)
    setSelected(new Set())
    // Re-fetch
    refreshRef.current++
    const params = new URLSearchParams()
    if (filters?.search) params.set('search', filters.search)
    if (filters?.type) params.set('type', filters.type)
    if (filters?.start_date) params.set('start_date', filters.start_date)
    if (filters?.end_date) params.set('end_date', filters.end_date)
    if (filters?.document_id) params.set('document_id', filters.document_id)
    if (filters?.category_ids && filters.category_ids.length > 0) {
      params.set('category_ids', filters.category_ids.join(','))
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))
    const data = await fetch(`/api/transactions?${params}`).then(r => r.json())
    setTransactions(data.transactions)
    setTotal(data.total)
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(t => t.id)))
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start = page * PAGE_SIZE + 1
  const end = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 rounded-md bg-blue-50 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialog({ type: 'bulk', ids: Array.from(selected) })}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={transactions.length > 0 && selected.size === transactions.length}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                No transactions found.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((txn) => (
              <TableRow key={txn.id} className={selected.has(txn.id) ? 'bg-blue-50/50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(txn.id)}
                    onCheckedChange={() => toggleSelect(txn.id)}
                  />
                </TableCell>
                <TableCell>{txn.date}</TableCell>
                <TableCell>{txn.description}</TableCell>
                <TableCell className={`text-right ${txn.type === 'credit' ? 'text-green-600' : ''}`}>
                  {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                </TableCell>
                <TableCell>
                  <span className={`text-xs uppercase ${txn.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {txn.type}
                  </span>
                </TableCell>
                <TableCell>
                  {txn.category_name ? (
                    <div className="flex items-center gap-2">
                      <CategoryBadge name={txn.category_name} color={txn.category_color!} />
                      <CategorySelect
                        categories={categories}
                        value={txn.category_id}
                        onValueChange={(catId) => updateCategory(txn.id, catId)}
                      />
                    </div>
                  ) : (
                    <CategorySelect
                      categories={categories}
                      value={null}
                      onValueChange={(catId) => updateCategory(txn.id, catId)}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-red-500"
                    onClick={() => setDeleteDialog({ type: 'single', ids: [txn.id] })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {start}-{end} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialog !== null} onOpenChange={(open) => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteDialog?.type === 'bulk' ? `${deleteDialog.ids.length} transactions` : 'transaction'}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. {deleteDialog?.type === 'bulk'
                ? `${deleteDialog.ids.length} transactions will be permanently deleted.`
                : 'This transaction will be permanently deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/transaction-table.tsx
git commit -m "feat: add checkboxes, delete, and pagination to transaction table"
```

---

### Task 9: Reports Dashboard Page

**Files:**
- Create: `src/components/reports/summary-cards.tsx`
- Create: `src/components/reports/spending-bar-chart.tsx`
- Create: `src/components/reports/category-pie-chart.tsx`
- Create: `src/components/reports/spending-trend-chart.tsx`
- Create: `src/components/reports/top-transactions-table.tsx`
- Create: `src/app/(app)/reports/page.tsx`

**Step 1: Create summary cards component**

Create `src/components/reports/summary-cards.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { DollarSign, TrendingUp, ArrowDownCircle, Tag } from 'lucide-react'

interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  avgMonthly: number
  topCategory: { name: string; amount: number }
}

export function SummaryCards({ totalSpent, totalIncome, avgMonthly, topCategory }: SummaryCardsProps) {
  const cards = [
    { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}`, icon: ArrowDownCircle, color: 'text-red-500' },
    { label: 'Total Income', value: `$${totalIncome.toFixed(2)}`, icon: DollarSign, color: 'text-green-500' },
    { label: 'Avg Monthly Spend', value: `$${avgMonthly.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Top Category', value: topCategory.name, sub: `$${topCategory.amount.toFixed(2)}`, icon: Tag, color: 'text-purple-500' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(c => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <c.icon className={`h-4 w-4 ${c.color}`} />
            <span className="text-xs text-gray-500 font-medium">{c.label}</span>
          </div>
          <p className="text-xl font-bold">{c.value}</p>
          {c.sub && <p className="text-sm text-gray-500">{c.sub}</p>}
        </Card>
      ))}
    </div>
  )
}
```

**Step 2: Create spending bar chart**

Create `src/components/reports/spending-bar-chart.tsx`:

```tsx
'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SpendingBarChartProps {
  data: Array<{ period: string; amount: number }>
}

export function SpendingBarChart({ data }: SpendingBarChartProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Spending Over Time</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spent']} />
            <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
```

**Step 3: Create category pie chart**

Create `src/components/reports/category-pie-chart.tsx`:

```tsx
'use client'

import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface CategoryPieChartProps {
  data: Array<{ category: string; color: string; amount: number; percentage: number }>
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  // Show top 8 + group rest as "Other"
  const top8 = data.slice(0, 8)
  const rest = data.slice(8)
  const chartData = rest.length > 0
    ? [...top8, { category: 'Other', color: '#9CA3AF', amount: rest.reduce((s, r) => s + r.amount, 0), percentage: rest.reduce((s, r) => s + r.percentage, 0) }]
    : top8

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Category Breakdown</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chartData} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
```

**Step 4: Create spending trend chart**

Create `src/components/reports/spending-trend-chart.tsx`:

```tsx
'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SpendingTrendChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Spending Trend</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
            <Legend />
            <Line type="monotone" dataKey="debits" stroke="hsl(var(--chart-1))" name="Spending" strokeWidth={2} />
            <Line type="monotone" dataKey="credits" stroke="hsl(var(--chart-2))" name="Income" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
```

**Step 5: Create top transactions table**

Create `src/components/reports/top-transactions-table.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface TopTransactionsTableProps {
  data: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
}

export function TopTransactionsTable({ data }: TopTransactionsTableProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Top Transactions</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(txn => (
              <TableRow key={txn.id}>
                <TableCell className="text-sm">{txn.date}</TableCell>
                <TableCell className="text-sm">{txn.description}</TableCell>
                <TableCell className="text-sm text-gray-500">{txn.category ?? 'Uncategorized'}</TableCell>
                <TableCell className={`text-sm text-right ${txn.type === 'credit' ? 'text-green-600' : ''}`}>
                  {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
```

**Step 6: Create reports page**

Create `src/app/(app)/reports/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SummaryCards } from '@/components/reports/summary-cards'
import { SpendingBarChart } from '@/components/reports/spending-bar-chart'
import { CategoryPieChart } from '@/components/reports/category-pie-chart'
import { SpendingTrendChart } from '@/components/reports/spending-trend-chart'
import { TopTransactionsTable } from '@/components/reports/top-transactions-table'

interface ReportData {
  summary: {
    totalSpent: number
    totalIncome: number
    avgMonthly: number
    topCategory: { name: string; amount: number }
  }
  spendingOverTime: Array<{ period: string; amount: number }>
  categoryBreakdown: Array<{ category: string; color: string; amount: number; percentage: number }>
  trend: Array<{ period: string; debits: number; credits: number }>
  topTransactions: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  switch (preset) {
    case 'thisMonth':
      return { start: `${yyyy}-${mm}-01`, end: today }
    case 'lastMonth': {
      const d = new Date(yyyy, now.getMonth() - 1, 1)
      const lastDay = new Date(yyyy, now.getMonth(), 0)
      return { start: d.toISOString().slice(0, 10), end: lastDay.toISOString().slice(0, 10) }
    }
    case 'thisQuarter': {
      const qStart = new Date(yyyy, Math.floor(now.getMonth() / 3) * 3, 1)
      return { start: qStart.toISOString().slice(0, 10), end: today }
    }
    case 'thisYear':
      return { start: `${yyyy}-01-01`, end: today }
    case 'last12Months': {
      const d = new Date(yyyy, now.getMonth() - 11, 1)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    default:
      return { start: '', end: '' }
  }
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    params.set('group_by', groupBy)

    fetch(`/api/reports?${params}`).then(r => r.json()).then(result => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [startDate, endDate, groupBy])

  const applyPreset = (preset: string) => {
    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else {
      const { start, end } = getDatePreset(preset)
      setStartDate(start)
      setEndDate(end)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Reports</h2>
        <p className="text-sm text-gray-500">Spending analytics and visualizations</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">From</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 text-sm" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">To</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 text-sm" />
        </div>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'month' | 'quarter' | 'year')}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="quarter">Quarterly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {[
            { label: 'This month', value: 'thisMonth' },
            { label: 'Last month', value: 'lastMonth' },
            { label: 'This quarter', value: 'thisQuarter' },
            { label: 'This year', value: 'thisYear' },
            { label: 'Last 12mo', value: 'last12Months' },
            { label: 'All time', value: 'all' },
          ].map(p => (
            <Button key={p.value} variant="outline" size="sm" onClick={() => applyPreset(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : data ? (
        <>
          <SummaryCards
            totalSpent={data.summary.totalSpent}
            totalIncome={data.summary.totalIncome}
            avgMonthly={data.summary.avgMonthly}
            topCategory={data.summary.topCategory}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SpendingBarChart data={data.spendingOverTime} />
            <CategoryPieChart data={data.categoryBreakdown} />
          </div>

          <SpendingTrendChart data={data.trend} />
          <TopTransactionsTable data={data.topTransactions} />
        </>
      ) : null}
    </div>
  )
}
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add src/components/reports/ src/app/\(app\)/reports/page.tsx
git commit -m "feat: add reports dashboard with charts and summary"
```

---

### Task 10: Settings Stub & Final Cleanup

**Files:**
- Create: `src/app/(app)/settings/page.tsx`

**Step 1: Create settings stub page**

Create `src/app/(app)/settings/page.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Tags, SlidersHorizontal } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-gray-500">App configuration and preferences</p>
      </div>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <Tags className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Category Management</h3>
        </div>
        <p className="text-sm text-gray-400">Add, edit, and organize spending categories. Coming soon.</p>
      </Card>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <SlidersHorizontal className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Preferences</h3>
        </div>
        <p className="text-sm text-gray-400">Currency, date format, and display options. Coming soon.</p>
      </Card>
    </div>
  )
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 4: Commit**

```bash
git add src/app/\(app\)/settings/page.tsx
git commit -m "feat: add settings stub page"
```

**Step 5: Manual smoke test**

Run: `npm run dev`

Verify:
- `/` redirects to `/transactions`
- Sidebar shows 3 tabs, active tab is highlighted
- Transactions page: upload zone, filter bar, table with checkboxes
- Filter bar: date range, category multi-select, type, document filters all work
- Single delete (trash icon) and bulk delete (checkbox + delete button) with confirmation dialog
- Pagination works
- `/reports` shows dashboard with summary cards and charts (may be empty if no data)
- `/settings` shows stub page
- Sidebar collapses to icons on narrow viewport

---

### Summary of All Files

**New files (15):**
- `src/lib/db/reports.ts`
- `src/__tests__/lib/db/reports.test.ts`
- `src/app/api/documents/route.ts`
- `src/app/api/reports/route.ts`
- `src/components/sidebar.tsx`
- `src/components/filter-bar.tsx`
- `src/components/reports/summary-cards.tsx`
- `src/components/reports/spending-bar-chart.tsx`
- `src/components/reports/category-pie-chart.tsx`
- `src/components/reports/spending-trend-chart.tsx`
- `src/components/reports/top-transactions-table.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/app/(app)/settings/page.tsx`

**Modified files (6):**
- `package.json` (add recharts)
- `src/lib/db/transactions.ts` (delete functions + extended filters)
- `src/lib/db/documents.ts` (listDocuments)
- `src/__tests__/lib/db/transactions.test.ts` (new tests)
- `src/__tests__/lib/db/documents.test.ts` (new test)
- `src/app/api/transactions/route.ts` (DELETE handler + extended GET)
- `src/app/api/transactions/[id]/route.ts` (DELETE handler)
- `src/app/page.tsx` (redirect)
- `src/components/transaction-table.tsx` (rewrite with checkboxes/delete/pagination)

**shadcn components added (3):** checkbox, dialog, popover

**Dependencies added (1):** recharts
