# Frontend Modernization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate copy-paste divergence and UI regressions by introducing shared types, TanStack Query hooks, and shared UI components.

**Architecture:** Bottom-up approach — shared API types first (compile-time safety), then TanStack Query hooks (eliminate 22+ raw fetch calls), then shared UI components (eliminate duplicated sort/selection/date patterns), then page decomposition, then tests.

**Tech Stack:** TanStack Query v5, @testing-library/react, existing Next.js 16 + TypeScript + Tailwind + shadcn/ui

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install TanStack Query and testing libraries**

```bash
npm install @tanstack/react-query
npm install -D @testing-library/react @testing-library/jest-dom jsdom
```

**Step 2: Verify build still works**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add TanStack Query, testing-library, jsdom"
```

---

### Task 2: Shared API Types — Categories, Common, Transactions

**Files:**
- Create: `src/types/categories.ts`
- Create: `src/types/common.ts`
- Create: `src/types/transactions.ts`
- Modify: `src/components/filter-bar.tsx` (remove inline Category, import from types)
- Modify: `src/components/transaction-table.tsx` (remove inline Transaction, Category, SortOrder, import from types)
- Modify: `src/components/flagged-transactions.tsx` (remove inline FlaggedTransaction, Category, import from types)
- Modify: `src/components/commitment-row-detail.tsx` (remove inline Transaction, import from types)

**Step 1: Create shared type files**

`src/types/common.ts`:
```ts
export type SortOrder = 'asc' | 'desc'
```

`src/types/categories.ts`:
```ts
export interface Category {
  id: number
  name: string
  color: string
  category_group?: string
}
```

`src/types/transactions.ts`:
```ts
export interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
  transaction_class: string | null
}

/** Subset used by commitment-row-detail trend chart */
export type TransactionSummary = Pick<Transaction, 'id' | 'date' | 'description' | 'amount'>

export interface FlaggedTransaction {
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

export interface MerchantGroup {
  key: string
  label: string
  flagType: 'duplicate' | 'category_mismatch' | 'suspicious'
  flags: FlaggedTransaction[]
  totalAmount: number
  count: number
}
```

**Step 2: Update imports in consuming files**

In each file, remove the inline interface and replace with:
- `filter-bar.tsx`: `import type { Category } from '@/types/categories'`
- `transaction-table.tsx`: `import type { Transaction } from '@/types/transactions'` and `import type { Category } from '@/types/categories'` and `import type { SortOrder } from '@/types/common'`
- `flagged-transactions.tsx`: `import type { FlaggedTransaction, MerchantGroup } from '@/types/transactions'` and `import type { Category } from '@/types/categories'`
- `commitment-row-detail.tsx`: `import type { TransactionSummary } from '@/types/transactions'` — rename local usage from `Transaction` to `TransactionSummary`

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 4: Run existing tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/types/ src/components/filter-bar.tsx src/components/transaction-table.tsx src/components/flagged-transactions.tsx src/components/commitment-row-detail.tsx
git commit -m "refactor: extract shared Category, Transaction, common types"
```

---

### Task 3: Shared API Types — Documents, Merchants, Commitments

**Files:**
- Create: `src/types/documents.ts`
- Create: `src/types/merchants.ts`
- Create: `src/types/commitments.ts`
- Modify: `src/app/(app)/documents/page.tsx` (remove inline DocumentRow, SortBy, SortOrder)
- Modify: `src/components/documents-table.tsx` (remove inline DocumentRow, SortBy)
- Modify: `src/app/(app)/merchants/page.tsx` (remove inline types, import from types)
- Modify: `src/app/(app)/commitments/page.tsx` (remove inline types, import from types)
- Modify: `src/components/commitment-table.tsx` (remove inline CommitmentGroup, SortBy, Frequency)

**Step 1: Create shared type files**

`src/types/documents.ts`:
```ts
export interface DocumentRow {
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

export type DocumentSortBy = 'filename' | 'uploaded_at' | 'document_type' | 'status' | 'actual_transaction_count'
```

`src/types/merchants.ts`:
```ts
export interface MerchantInfo {
  merchant: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
  categoryName: string | null
  categoryColor: string | null
}

export interface MergeSuggestion {
  canonical: string
  variants: string[]
}

export interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

export interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

export type MerchantSortBy = 'merchant' | 'transactionCount' | 'totalAmount' | 'categoryName' | 'lastDate'
```

`src/types/commitments.ts`:
```ts
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'yearly' | 'irregular'

export interface CommitmentGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: Frequency
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
  unexpectedActivity?: boolean
  frequencyOverride?: string | null
  monthlyAmountOverride?: number | null
}

export interface EndedCommitmentGroup extends CommitmentGroup {
  statusChangedAt: string
  unexpectedActivity: boolean
}

export interface CommitmentData {
  activeGroups: CommitmentGroup[]
  endedGroups: EndedCommitmentGroup[]
  excludedMerchants: Array<{ merchant: string; excludedAt: string }>
  summary: {
    activeCount: number
    activeMonthly: number
    endedCount: number
    endedWasMonthly: number
    excludedCount: number
  }
  trendData: Array<{ month: string; amount: number }>
}

export type CommitmentSortBy = 'merchantName' | 'frequency' | 'category' | 'avgAmount' | 'estimatedMonthlyAmount' | 'occurrences' | 'lastDate'
```

**Step 2: Update imports in consuming files**

- `documents/page.tsx`: remove `DocumentRow`, `SortBy`, `SortOrder` inline types → `import type { DocumentRow, DocumentSortBy } from '@/types/documents'` and `import type { SortOrder } from '@/types/common'`
- `documents-table.tsx`: same pattern
- `merchants/page.tsx`: remove all 4 inline interfaces + `SortBy` → import from `@/types/merchants`
- `commitments/page.tsx`: remove `CommitmentGroup`, `EndedCommitmentGroup`, `CommitmentData`, `SortBy` → import from `@/types/commitments`
- `commitment-table.tsx`: remove `CommitmentGroup`, `SortBy`, `Frequency` → import from `@/types/commitments`

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Run tests**

Run: `npm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/types/ "src/app/(app)/documents/page.tsx" src/components/documents-table.tsx "src/app/(app)/merchants/page.tsx" "src/app/(app)/commitments/page.tsx" src/components/commitment-table.tsx
git commit -m "refactor: extract shared Document, Merchant, Commitment types"
```

---

### Task 4: Shared API Types — Reports, Accounts, Settings, Insights

**Files:**
- Create: `src/types/reports.ts`
- Create: `src/types/accounts.ts`
- Create: `src/types/settings.ts`
- Create: `src/types/insights.ts`
- Modify: `src/app/(app)/reports/page.tsx` (remove inline ReportData)
- Modify: `src/app/(app)/accounts/page.tsx` (remove inline AccountData, UnassignedDoc)
- Modify: `src/app/(app)/settings/page.tsx` (remove inline ProviderConfig)
- Modify: `src/app/(app)/insights/page.tsx` (import from `@/types/insights` instead of `@/lib/insights/types`)

**Step 1: Create shared type files**

`src/types/reports.ts`:
```ts
export interface ReportData {
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
  sankeyData: Array<{ category: string; category_group: string; color: string; amount: number }>
  sankeyIncomeData: Array<{ category: string; category_group: string; color: string; amount: number }>
  momComparison: Array<{ group: string; current: number; previous: number; delta: number; percentChange: number }>
}
```

`src/types/accounts.ts`:
```ts
export interface AccountData {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  documentCount: number
  months: Record<string, { status: 'complete' | 'missing'; documents: Array<{ filename: string; statementDate: string | null }> }>
}

export interface UnassignedDoc {
  id: number
  filename: string
  document_type: string | null
  status: string
}
```

`src/types/settings.ts`:
```ts
export interface ProviderConfig {
  name: string
  envKey: string
  models: { id: string; name: string }[]
  defaults: Record<string, string>
}
```

`src/types/insights.ts` — re-export from the existing canonical source:
```ts
export type { InsightsResponse, Insight, HealthAssessment, MonthlyFlow, HealthMetric, InsightSeverity, InsightType } from '@/lib/insights/types'
```

**Step 2: Update imports in consuming files**

- `reports/page.tsx`: remove inline `ReportData` → `import type { ReportData } from '@/types/reports'`
- `accounts/page.tsx`: remove inline types → `import type { AccountData, UnassignedDoc } from '@/types/accounts'`
- `settings/page.tsx`: remove inline `ProviderConfig` → `import type { ProviderConfig } from '@/types/settings'`
- `insights/page.tsx`: change `import type { InsightsResponse, Insight } from '@/lib/insights/types'` → `import type { InsightsResponse, Insight } from '@/types/insights'`
- Also update any other files importing from `@/lib/insights/types` to use `@/types/insights`

**Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: All pass

**Step 4: Commit**

```bash
git add src/types/ "src/app/(app)/reports/page.tsx" "src/app/(app)/accounts/page.tsx" "src/app/(app)/settings/page.tsx" "src/app/(app)/insights/page.tsx"
git commit -m "refactor: extract shared Report, Account, Settings, Insights types"
```

---

### Task 5: Shared API Types — Filters (exported from filter-bar)

**Note:** `Filters` and `EMPTY_FILTERS` are already exported from `filter-bar.tsx` and imported by `transaction-table.tsx` and `transactions/page.tsx`. Move the type to `src/types/` and re-export from filter-bar for backwards compat.

**Files:**
- Create: `src/types/filters.ts`
- Modify: `src/components/filter-bar.tsx` (import from types, re-export)
- Modify: `src/components/transaction-table.tsx` (import Filters from types instead of filter-bar)
- Modify: `src/app/(app)/transactions/page.tsx` (import Filters from types)

**Step 1: Create filters type**

`src/types/filters.ts`:
```ts
export interface Filters {
  search: string
  type: '' | 'debit' | 'credit'
  start_date: string
  end_date: string
  category_ids: number[]
  document_id: string
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  start_date: '',
  end_date: '',
  category_ids: [],
  document_id: '',
}
```

**Step 2: Update filter-bar.tsx**

Remove inline `Filters` interface and `EMPTY_FILTERS` constant. Add:
```ts
import type { Filters } from '@/types/filters'
import { EMPTY_FILTERS } from '@/types/filters'
export type { Filters }
export { EMPTY_FILTERS }
```

**Step 3: Update consumers to import from `@/types/filters` directly**

- `transaction-table.tsx`: `import type { Filters } from '@/types/filters'`
- `transactions/page.tsx`: `import { EMPTY_FILTERS, type Filters } from '@/types/filters'` (remove import from filter-bar, keep FilterBar component import)

**Step 4: Verify build + tests**

Run: `npm run build && npm test`

**Step 5: Commit**

```bash
git add src/types/filters.ts src/components/filter-bar.tsx src/components/transaction-table.tsx "src/app/(app)/transactions/page.tsx"
git commit -m "refactor: extract Filters type to shared types"
```

---

### Task 6: TanStack Query Provider Setup

**Files:**
- Create: `src/hooks/query-provider.tsx`
- Modify: `src/app/layout.tsx` (wrap children with QueryProvider)

**Step 1: Create the provider**

`src/hooks/query-provider.tsx`:
```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

**Step 2: Add to layout.tsx**

Wrap `{children}` inside ThemeProvider with QueryProvider:
```tsx
import { QueryProvider } from '@/hooks/query-provider'
// ...
<ThemeProvider>
  <QueryProvider>
    {children}
  </QueryProvider>
</ThemeProvider>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/hooks/query-provider.tsx src/app/layout.tsx
git commit -m "feat: add TanStack Query provider to app layout"
```

---

### Task 7: useCategories Hook (most duplicated fetch — 4 places)

**Files:**
- Create: `src/hooks/use-categories.ts`
- Modify: `src/components/filter-bar.tsx` (replace useState+useEffect fetch with hook)
- Modify: `src/components/transaction-table.tsx` (replace useState+useEffect fetch with hook)
- Modify: `src/components/flagged-transactions.tsx` (replace useState+useEffect fetch with hook)

**Step 1: Create the hook**

`src/hooks/use-categories.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import type { Category } from '@/types/categories'

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories')
      if (!res.ok) throw new Error('Failed to fetch categories')
      return res.json()
    },
    staleTime: 5 * 60_000, // categories rarely change
  })
}
```

**Step 2: Replace in each consumer**

In each file, remove the `useState` for categories and the `useEffect` that fetches them. Replace with:
```ts
const { data: categories = [] } = useCategories()
```

For `filter-bar.tsx`: remove lines that fetch `/api/categories` in useEffect, remove `categories` state variable.
For `transaction-table.tsx`: same pattern.
For `flagged-transactions.tsx`: same pattern.

**Step 3: Verify build + manual test**

Run: `npm run build`
Expected: Build succeeds. Manual: open app, verify categories load in filter bar, transaction table category picker, and flagged transactions view.

**Step 4: Commit**

```bash
git add src/hooks/use-categories.ts src/components/filter-bar.tsx src/components/transaction-table.tsx src/components/flagged-transactions.tsx
git commit -m "refactor: replace 3 duplicate category fetches with useCategories hook"
```

---

### Task 8: useDocuments Hook (polling pattern)

**Files:**
- Create: `src/hooks/use-documents.ts`
- Modify: `src/app/(app)/documents/page.tsx` (replace fetch + polling with hook)
- Modify: `src/components/filter-bar.tsx` (replace documents fetch with hook)

**Step 1: Create the hook**

`src/hooks/use-documents.ts`:
```ts
import { useQuery } from '@tanstack/react-query'
import type { DocumentRow, DocumentSortBy } from '@/types/documents'
import type { SortOrder } from '@/types/common'

export function useDocuments(sortBy: DocumentSortBy = 'uploaded_at', sortOrder: SortOrder = 'desc') {
  const query = useQuery<DocumentRow[]>({
    queryKey: ['documents', sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/documents?sort_by=${sortBy}&sort_order=${sortOrder}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
  })

  // Auto-poll when any document is processing
  const hasProcessing = query.data?.some(d => d.status === 'processing')

  return useQuery<DocumentRow[]>({
    queryKey: ['documents', sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/documents?sort_by=${sortBy}&sort_order=${sortOrder}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    refetchInterval: hasProcessing ? 2000 : false,
  })
}

/** Lightweight version for filter bar — just needs id + filename */
export function useDocumentList() {
  return useQuery<Array<{ id: number; filename: string }>>({
    queryKey: ['documents', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/documents')
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    staleTime: 60_000,
  })
}
```

**Step 2: Replace in documents/page.tsx**

Remove `documents` state, `loading` state, `fetchDocuments` function, useEffect with polling. Replace with:
```ts
const { data: documents = [], isLoading: loading, refetch } = useDocuments(sortBy, sortOrder)
```

Remove the polling setInterval — `refetchInterval` handles it.

**Step 3: Replace in filter-bar.tsx**

Remove the documents fetch in useEffect. Replace with:
```ts
const { data: documents = [] } = useDocumentList()
```

**Step 4: Verify build + manual test**

Run: `npm run build`
Manual: upload a PDF, verify polling works (documents table updates as processing completes).

**Step 5: Commit**

```bash
git add src/hooks/use-documents.ts "src/app/(app)/documents/page.tsx" src/components/filter-bar.tsx
git commit -m "refactor: replace document fetch + polling with useDocuments hook"
```

---

### Task 9: useTransactions Hook

**Files:**
- Create: `src/hooks/use-transactions.ts`
- Modify: `src/components/transaction-table.tsx` (replace fetch with hook)
- Modify: `src/components/flagged-transactions.tsx` (replace fetch with hook)
- Modify: `src/app/(app)/transactions/page.tsx` (replace flag count fetch with hook)

**Step 1: Create the hook**

`src/hooks/use-transactions.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Transaction, FlaggedTransaction } from '@/types/transactions'
import type { Filters } from '@/types/filters'
import type { SortOrder } from '@/types/common'

type TransactionSortBy = 'date' | 'amount' | 'description'

function buildParams(filters: Filters | undefined, page: number, sortBy: TransactionSortBy, sortOrder: SortOrder): URLSearchParams {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.document_id) params.set('document_id', filters.document_id)
  if (filters?.category_ids?.length) params.set('category_ids', filters.category_ids.join(','))
  params.set('limit', '50')
  params.set('offset', String(page * 50))
  params.set('sort_by', sortBy)
  params.set('sort_order', sortOrder)
  return params
}

export function useTransactions(filters: Filters | undefined, page: number, sortBy: TransactionSortBy, sortOrder: SortOrder) {
  return useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ['transactions', filters, page, sortBy, sortOrder],
    queryFn: async () => {
      const params = buildParams(filters, page, sortBy, sortOrder)
      const res = await fetch(`/api/transactions?${params}`)
      if (!res.ok) throw new Error('Failed to fetch transactions')
      return res.json()
    },
  })
}

export function useFlagCount() {
  return useQuery<number>({
    queryKey: ['transactions', 'flagCount'],
    queryFn: async () => {
      const res = await fetch('/api/transactions?flag_count=true')
      if (!res.ok) throw new Error('Failed to fetch flag count')
      const data = await res.json()
      return data.count
    },
  })
}

export function useFlaggedTransactions() {
  return useQuery<FlaggedTransaction[]>({
    queryKey: ['transactions', 'flagged'],
    queryFn: async () => {
      const res = await fetch('/api/transactions?flagged=true')
      if (!res.ok) throw new Error('Failed to fetch flagged transactions')
      return res.json()
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, unknown> }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update transaction')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useResolveFlags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { flagIds: number[]; resolution: string; newCategoryId?: number }) => {
      const res = await fetch('/api/transactions/flags/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to resolve flags')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
```

**Step 2: Replace in transaction-table.tsx**

Remove `fetchTransactions` function, the `transactions`/`total`/`loading` state, and the useEffect. Replace with:
```ts
const { data, isLoading: loading } = useTransactions(filters, page, sortBy, sortOrder)
const transactions = data?.transactions ?? []
const total = data?.total ?? 0
```

Replace manual PATCH/DELETE fetch calls with `useUpdateTransaction` mutation or inline mutations.

**Step 3: Replace in flagged-transactions.tsx**

Remove the flags fetch useEffect and `flags`/`loading` state. Replace with:
```ts
const { data: flags = [], isLoading: loading } = useFlaggedTransactions()
```

Replace the resolve fetch with `useResolveFlags` mutation.

**Step 4: Replace in transactions/page.tsx**

Remove the flag count useEffect. Replace with:
```ts
const { data: flagCount = 0 } = useFlagCount()
```

**Step 5: Verify build + test**

Run: `npm run build && npm test`

**Step 6: Commit**

```bash
git add src/hooks/use-transactions.ts src/components/transaction-table.tsx src/components/flagged-transactions.tsx "src/app/(app)/transactions/page.tsx"
git commit -m "refactor: replace transaction fetches with useTransactions hooks"
```

---

### Task 10: useCommitments Hook

**Files:**
- Create: `src/hooks/use-commitments.ts`
- Modify: `src/app/(app)/commitments/page.tsx` (replace all fetch calls with hook)

**Step 1: Create the hook**

`src/hooks/use-commitments.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CommitmentData } from '@/types/commitments'

export function useCommitments(startDate: string, endDate: string) {
  return useQuery<CommitmentData>({
    queryKey: ['commitments', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      const res = await fetch(`/api/commitments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch commitments')
      return res.json()
    },
  })
}

export function useCommitmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchant: string; status: 'ended' | 'not_recurring' | 'active' }) => {
      const res = await fetch('/api/commitments/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update commitment status')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useCommitmentMerge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchants: string[]; targetName: string }) => {
      const res = await fetch('/api/commitments/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to merge commitments')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}

export function useCommitmentOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchant: string; frequencyOverride: string | null; monthlyAmountOverride: number | null }) => {
      const res = await fetch('/api/commitments/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to override commitment')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useNormalizeCommitments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/commitments/normalize', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to normalize')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}
```

**Step 2: Replace in commitments/page.tsx**

Remove all 8+ fetch calls and their associated useState/useEffect. Replace with hook calls. Keep the optimistic update pattern using `queryClient.setQueryData` for immediate UI feedback.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/hooks/use-commitments.ts "src/app/(app)/commitments/page.tsx"
git commit -m "refactor: replace commitment fetches with useCommitments hooks"
```

---

### Task 11: useMerchants Hook

**Files:**
- Create: `src/hooks/use-merchants.ts`
- Modify: `src/app/(app)/merchants/page.tsx` (replace all fetch calls with hooks)

**Step 1: Create the hook**

`src/hooks/use-merchants.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MerchantInfo, MergeSuggestion, DescriptionGroup, MerchantTransaction, MerchantSortBy } from '@/types/merchants'
import type { SortOrder } from '@/types/common'

export function useMerchants(search: string, sortBy: MerchantSortBy, sortOrder: SortOrder) {
  return useQuery<MerchantInfo[]>({
    queryKey: ['merchants', search, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({ sort_by: sortBy, sort_order: sortOrder })
      if (search) params.set('search', search)
      const res = await fetch(`/api/merchants?${params}`)
      if (!res.ok) throw new Error('Failed to fetch merchants')
      return res.json()
    },
  })
}

export function useMerchantGroups(merchant: string | null) {
  return useQuery<DescriptionGroup[]>({
    queryKey: ['merchants', merchant, 'groups'],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${encodeURIComponent(merchant!)}`)
      if (!res.ok) throw new Error('Failed to fetch merchant groups')
      return res.json()
    },
    enabled: !!merchant,
  })
}

export function useMerchantTransactions(merchant: string | null, description: string | null) {
  return useQuery<MerchantTransaction[]>({
    queryKey: ['merchants', merchant, 'transactions', description],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${encodeURIComponent(merchant!)}?description=${encodeURIComponent(description!)}`)
      if (!res.ok) throw new Error('Failed to fetch merchant transactions')
      return res.json()
    },
    enabled: !!merchant && !!description,
  })
}

export function useMergePreview() {
  return useMutation({
    mutationFn: async (body: { merchants: string[] }) => {
      const res = await fetch('/api/merchants/merge-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to get merge preview')
      return res.json()
    },
  })
}

export function useMerchantMerge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchants: string[]; targetName: string }) => {
      const res = await fetch('/api/commitments/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to merge merchants')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useSuggestMerges() {
  return useMutation<MergeSuggestion[]>({
    mutationFn: async () => {
      const res = await fetch('/api/merchants/suggest-merges', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to suggest merges')
      return res.json()
    },
  })
}

export function useMerchantSplit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchant: string; description: string; newMerchant: string }) => {
      const res = await fetch('/api/merchants/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to split merchant')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}
```

**Step 2: Replace in merchants/page.tsx**

Remove all useState for data + loading + fetch functions. Replace with hook calls. The page becomes an orchestrator that calls hooks and passes data to future sub-components.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/hooks/use-merchants.ts "src/app/(app)/merchants/page.tsx"
git commit -m "refactor: replace merchant fetches with useMerchants hooks"
```

---

### Task 12: useReports, useInsights, useAccounts, useSettings Hooks

**Files:**
- Create: `src/hooks/use-reports.ts`
- Create: `src/hooks/use-insights.ts`
- Create: `src/hooks/use-accounts.ts`
- Create: `src/hooks/use-settings.ts`
- Modify: `src/app/(app)/reports/page.tsx`
- Modify: `src/app/(app)/insights/page.tsx`
- Modify: `src/app/(app)/accounts/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Step 1: Create hooks**

Each follows the same pattern as previous tasks. Key details:

`use-reports.ts`: `useReports(startDate, endDate, groupBy)` — single query, no mutations.

`use-insights.ts`: `useInsights()` with `refetchInterval` when `status === 'generating'`. Mutation for dismiss/clear.

`use-accounts.ts`: `useAccounts()` query + mutations for rename, merge, detect, reset.

`use-settings.ts`: `useSettings()` query + mutation for save. Optimistic update on provider/model change with rollback.

**Step 2: Replace fetch patterns in each page**

Same approach as previous tasks — remove useState/useEffect/fetch, replace with hook.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/hooks/ "src/app/(app)/reports/page.tsx" "src/app/(app)/insights/page.tsx" "src/app/(app)/accounts/page.tsx" "src/app/(app)/settings/page.tsx"
git commit -m "refactor: replace report, insight, account, settings fetches with hooks"
```

---

### Task 13: Shared SortableHeader Component

**Files:**
- Create: `src/components/shared/sortable-header.tsx`
- Modify: `src/components/transaction-table.tsx` (replace inline sort icon logic)
- Modify: `src/components/commitment-table.tsx` (replace inline sort icon logic)
- Modify: `src/components/documents-table.tsx` (replace inline sort icon logic)
- Modify: `src/app/(app)/merchants/page.tsx` (replace inline sort icon logic)

**Step 1: Create the component**

`src/components/shared/sortable-header.tsx`:
```tsx
'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'

interface SortableHeaderProps<T extends string> {
  column: T
  label: string
  currentSort: T
  currentOrder: 'asc' | 'desc'
  onSort: (column: T) => void
  className?: string
}

export function SortableHeader<T extends string>({
  column,
  label,
  currentSort,
  currentOrder,
  onSort,
  className,
}: SortableHeaderProps<T>) {
  const isActive = currentSort === column
  return (
    <TableHead
      className={`cursor-pointer select-none ${className ?? ''}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  )
}
```

**Step 2: Replace in each consumer**

In each file, remove the `sortIcon()` / `renderSortIcon()` helper function and the inline `<TableHead onClick>` pattern. Replace with `<SortableHeader>`.

Example replacement in `transaction-table.tsx`:
```tsx
// Before:
<TableHead className="cursor-pointer" onClick={() => handleSort('date')}>
  Date {sortIcon('date')}
</TableHead>

// After:
<SortableHeader column="date" label="Date" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/shared/sortable-header.tsx src/components/transaction-table.tsx src/components/commitment-table.tsx src/components/documents-table.tsx "src/app/(app)/merchants/page.tsx"
git commit -m "refactor: extract shared SortableHeader component, replace 4 duplicates"
```

---

### Task 14: Shared SelectionBar Component

**Files:**
- Create: `src/components/shared/selection-bar.tsx`
- Modify: `src/components/transaction-table.tsx` (replace inline selection bar)
- Modify: `src/app/(app)/merchants/page.tsx` (replace inline selection bar)
- Modify: `src/app/(app)/commitments/page.tsx` (replace inline selection bar)

**Step 1: Create the component**

`src/components/shared/selection-bar.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface SelectionBarProps {
  count: number
  onClear: () => void
  children: React.ReactNode
  sticky?: boolean
}

export function SelectionBar({ count, onClear, children, sticky = true }: SelectionBarProps) {
  if (count === 0) return null

  return (
    <div className={`${sticky ? 'sticky bottom-0' : ''} bg-background border-t p-2 flex items-center gap-2 text-xs`}>
      <span className="text-muted-foreground">{count} selected</span>
      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> Clear
      </Button>
      <div className="flex-1" />
      {children}
    </div>
  )
}
```

**Step 2: Replace in each consumer**

Replace the inline "N selected" + clear button + action buttons pattern in each file with `<SelectionBar>` wrapping the action buttons as children.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/shared/selection-bar.tsx src/components/transaction-table.tsx "src/app/(app)/merchants/page.tsx" "src/app/(app)/commitments/page.tsx"
git commit -m "refactor: extract shared SelectionBar component, replace 3 duplicates"
```

---

### Task 15: Shared DateRangePicker Component

**Files:**
- Create: `src/components/shared/date-range-picker.tsx`
- Modify: `src/app/(app)/commitments/page.tsx` (replace inline date range UI)
- Modify: `src/app/(app)/reports/page.tsx` (replace inline date range UI)

**Step 1: Create the component**

`src/components/shared/date-range-picker.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDatePreset } from '@/lib/date-presets'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  presets?: boolean
}

const PRESETS = [
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: 'All', value: 'all' },
] as const

export function DateRangePicker({ startDate, endDate, onChange, presets = true }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={startDate}
        onChange={e => onChange(e.target.value, endDate)}
        className="h-7 text-xs w-32"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={endDate}
        onChange={e => onChange(startDate, e.target.value)}
        className="h-7 text-xs w-32"
      />
      {presets && (
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                const preset = getDatePreset(p.value)
                onChange(preset.start, preset.end)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Replace in commitments/page.tsx and reports/page.tsx**

Replace inline date inputs + preset buttons with `<DateRangePicker>`.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/components/shared/date-range-picker.tsx "src/app/(app)/commitments/page.tsx" "src/app/(app)/reports/page.tsx"
git commit -m "refactor: extract shared DateRangePicker component"
```

---

### Task 16: Decompose Merchants Page

**Files:**
- Create: `src/components/merchants/merchant-table.tsx`
- Create: `src/components/merchants/merchant-merge-dialog.tsx`
- Create: `src/components/merchants/merchant-expand.tsx`
- Modify: `src/app/(app)/merchants/page.tsx` (slim down to ~80 LOC orchestrator)

**Step 1: Extract merchant-expand.tsx**

Move the nested expansion logic (description groups → transaction list) into its own component. It receives merchant name and uses `useMerchantGroups` and `useMerchantTransactions` hooks.

**Step 2: Extract merchant-merge-dialog.tsx**

Move the merge dialog (preview + confirm) into its own component. It receives selected merchants and uses `useMergePreview` and `useMerchantMerge` hooks.

**Step 3: Extract merchant-table.tsx**

Move the table rendering (rows, sort headers, checkboxes, expansion toggle) into its own component. Uses `SortableHeader`, `SelectionBar`, and `merchant-expand`.

**Step 4: Slim down page.tsx**

Page becomes: hook calls + search input + suggest merges button + `<MerchantTable>` + `<MerchantMergeDialog>`.

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/components/merchants/ "src/app/(app)/merchants/page.tsx"
git commit -m "refactor: decompose merchants page into table, merge dialog, expand components"
```

---

### Task 17: Decompose Commitments Page

**Files:**
- Create: `src/components/commitments/commitment-filters.tsx`
- Create: `src/components/commitments/commitment-actions.tsx`
- Modify: `src/app/(app)/commitments/page.tsx` (slim down to orchestrator)

**Step 1: Extract commitment-filters.tsx**

Move the date range picker + status tabs (Active/Ended/Excluded) into a dedicated filter component.

**Step 2: Extract commitment-actions.tsx**

Move the bulk action bar (End/Exclude/Merge buttons + merge dialog) into its own component.

**Step 3: Slim down page.tsx**

Page becomes: hook calls + `<CommitmentFilters>` + `<CommitmentTrendChart>` + `<CommitmentTable>` + `<CommitmentActions>`.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/components/commitments/ "src/app/(app)/commitments/page.tsx"
git commit -m "refactor: decompose commitments page into filters and actions components"
```

---

### Task 18: Decompose Insights Page

**Files:**
- Create: `src/components/insights/insights-carousel.tsx`
- Create: `src/components/insights/insights-header.tsx`
- Modify: `src/app/(app)/insights/page.tsx` (slim down to orchestrator)

**Step 1: Extract insights-header.tsx**

Move health score display + income/outflow chart area + navigation links into a header component.

**Step 2: Extract insights-carousel.tsx**

Move the paginated insight cards (severity coloring, type pills, evidence bars, dismiss logic) into its own component. Uses `useInsights` hook for dismiss mutations.

**Step 3: Slim down page.tsx**

Page becomes: hook calls + loading state + `<InsightsHeader>` + `<InsightsCarousel>`.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/components/insights/ "src/app/(app)/insights/page.tsx"
git commit -m "refactor: decompose insights page into header and carousel components"
```

---

### Task 19: Add Vitest Config for React Component Testing

**Files:**
- Modify: `vitest.config.ts` (add jsdom environment, setup file)
- Create: `src/__tests__/setup.ts` (testing-library setup)

**Step 1: Update vitest config**

Add to `vitest.config.ts`:
```ts
environment: 'jsdom',
setupFiles: ['./src/__tests__/setup.ts'],
```

Note: Keep `environment: 'jsdom'` only for component/hook tests. If existing DB tests break with jsdom, use `// @vitest-environment node` comment in those test files, or set up per-file environment overrides.

**Step 2: Create setup file**

`src/__tests__/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

**Step 3: Verify existing tests still pass**

Run: `npm test`
Expected: All existing tests pass (they use `:memory:` DB which works in both node and jsdom, but if any fail, add `// @vitest-environment node` to their files)

**Step 4: Commit**

```bash
git add vitest.config.ts src/__tests__/setup.ts
git commit -m "chore: configure vitest for React component testing with jsdom"
```

---

### Task 20: Test useCategories Hook

**Files:**
- Create: `src/__tests__/hooks/use-categories.test.ts`

**Step 1: Write the test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCategories } from '@/hooks/use-categories'
import React from 'react'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useCategories', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches categories and returns data', async () => {
    const mockCategories = [
      { id: 1, name: 'Food', color: '#ff0000' },
      { id: 2, name: 'Transport', color: '#00ff00' },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategories), { status: 200 })
    )

    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockCategories)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/categories')
  })

  it('returns empty array as default when query has not resolved', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})) // never resolves

    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })

  it('handles fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    )

    const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

**Step 2: Run the test**

Run: `npm test -- src/__tests__/hooks/use-categories.test.ts`
Expected: 3 tests pass

**Step 3: Commit**

```bash
git add src/__tests__/hooks/use-categories.test.ts
git commit -m "test: add useCategories hook tests"
```

---

### Task 21: Test useDocuments Hook (Polling Behavior)

**Files:**
- Create: `src/__tests__/hooks/use-documents.test.ts`

**Step 1: Write tests**

Test cases:
1. Fetches documents with sort params
2. Does NOT set refetchInterval when no documents are processing
3. Sets refetchInterval when a document has `status: 'processing'`

Use `vi.spyOn(globalThis, 'fetch')` and the same QueryClient wrapper pattern.

**Step 2: Run**

Run: `npm test -- src/__tests__/hooks/use-documents.test.ts`

**Step 3: Commit**

```bash
git add src/__tests__/hooks/use-documents.test.ts
git commit -m "test: add useDocuments hook tests with polling behavior"
```

---

### Task 22: Test SortableHeader Component

**Files:**
- Create: `src/__tests__/components/sortable-header.test.tsx`

**Step 1: Write the test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SortableHeader } from '@/components/shared/sortable-header'
import { Table, TableHeader, TableRow } from '@/components/ui/table'
import React from 'react'

function renderInTable(ui: React.ReactElement) {
  return render(
    <Table><TableHeader><TableRow>{ui}</TableRow></TableHeader></Table>
  )
}

describe('SortableHeader', () => {
  it('renders label text', () => {
    renderInTable(
      <SortableHeader column="date" label="Date" currentSort="date" currentOrder="asc" onSort={() => {}} />
    )
    expect(screen.getByText('Date')).toBeInTheDocument()
  })

  it('calls onSort with column when clicked', () => {
    const onSort = vi.fn()
    renderInTable(
      <SortableHeader column="amount" label="Amount" currentSort="date" currentOrder="asc" onSort={onSort} />
    )
    fireEvent.click(screen.getByText('Amount'))
    expect(onSort).toHaveBeenCalledWith('amount')
  })

  it('shows active sort direction indicator', () => {
    const { container } = renderInTable(
      <SortableHeader column="date" label="Date" currentSort="date" currentOrder="desc" onSort={() => {}} />
    )
    // ArrowDown should be rendered (not ArrowUpDown)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

**Step 2: Run**

Run: `npm test -- src/__tests__/components/sortable-header.test.tsx`

**Step 3: Commit**

```bash
git add src/__tests__/components/sortable-header.test.tsx
git commit -m "test: add SortableHeader component tests"
```

---

### Task 23: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add new conventions**

Add to the React & UI section:
- `src/types/` — shared API response types, one file per domain. All components and API routes import from here
- `src/hooks/` — TanStack Query hooks, one file per domain. `QueryProvider` in `layout.tsx`
- `src/components/shared/` — shared UI components (SortableHeader, SelectionBar, DateRangePicker)
- When adding a new API endpoint: define response types in `src/types/`, create hook in `src/hooks/`
- When adding sorting to a table: use `<SortableHeader>` from `@/components/shared/sortable-header`
- `@tanstack/react-query` for all data fetching — no raw `fetch()` + `useState` in components

**Step 2: Verify build + tests**

Run: `npm run build && npm test`

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with shared types, hooks, and component conventions"
```
