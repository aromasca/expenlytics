# Codebase Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all lint errors, remove dead code/deps, add missing error handlers, extract shared chart theme, and update documentation.

**Architecture:** Five independent workstreams touching non-overlapping files, suitable for parallel execution. Each workstream is a single commit.

**Tech Stack:** Next.js 16, React 19, TypeScript, Recharts, shadcn/ui, Vitest

---

## Task 1: Fix Lint Errors & Warnings

**Files:**
- Modify: `src/components/insights/health-score.tsx:63,72-73`
- Modify: `src/app/api/commitments/route.ts:52-53`
- Modify: `src/components/commitment-row-detail.tsx:8,103`
- Modify: `src/components/commitment-trend-chart.tsx:45`

**Step 1: Fix `setState` in useEffect (health-score.tsx)**

The lint error is `setMounted(true)` called synchronously in a useEffect. The `mounted` state gates the SVG animation (controls `strokeDashoffset`). Fix: initialize `mounted` to `false` and set it via `requestAnimationFrame` callback (which is already async).

Actually the simplest fix: `setMounted(true)` is needed on first render to trigger the CSS transition. Use `setTimeout(() => setMounted(true), 0)` per CLAUDE.md React 19 convention:

```tsx
useEffect(() => {
  setTimeout(() => setMounted(true), 0)

  let frame: number
  // ... rest unchanged
}, [health.score])
```

**Step 2: Fix unused `_transactionData` destructure (commitments/route.ts:52-53)**

The `_transactionData` is destructured in `stripInternal` but marked unused. The destructure IS the usage (stripping it from response). Prefix with underscore is already done. The lint rule flags it because the variable is assigned but not read. Fix: use rest pattern without naming the discarded property — but that's exactly what's happening. The fix is to add an eslint-disable comment since this is intentional destructure-to-omit pattern:

```ts
const stripInternal = (g: typeof allGroups[number]) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _transactionData, ...rest } = g
  return rest
}
```

**Step 3: Fix unused imports/variables in commitment components**

- `commitment-row-detail.tsx:8` — remove `formatCurrency` from import (only `formatCurrencyPrecise` is used)
- `commitment-row-detail.tsx:103` — remove `gridColor` variable (unused)
- `commitment-trend-chart.tsx:45` — remove `fillColor` variable (unused, gradient is defined inline)

**Step 4: Run lint to verify all errors are fixed**

Run: `npm run lint`
Expected: 0 errors, 0 warnings (or only pre-existing non-fixable ones)

**Step 5: Run tests to verify nothing broke**

Run: `npm test`
Expected: All 238 tests pass

**Step 6: Commit**

```bash
git add src/components/insights/health-score.tsx src/app/api/commitments/route.ts src/components/commitment-row-detail.tsx src/components/commitment-trend-chart.tsx
git commit -m "fix: resolve all lint errors and warnings"
```

---

## Task 2: Add Missing .catch() Handlers on Fetch Chains

**Files:**
- Modify: `src/components/transaction-table.tsx:71,94,139,141`
- Modify: `src/components/filter-bar.tsx:123,126`

**Step 1: Add .catch() to transaction-table.tsx fetch chains**

Line 71 (categories fetch):
```tsx
fetch('/api/categories').then(r => r.json()).then(data => {
  if (!cancelled) setCategories(data)
}).catch(() => {})
```

Line 94 (transactions useEffect fetch):
```tsx
fetch(`/api/transactions?${params}`).then(r => r.json()).then(data => {
  if (!cancelled) {
    setTransactions(data.transactions)
    setTotal(data.total)
  }
}).catch(() => {})
```

Lines 139,141 (delete operations — these are inside `confirmDelete` which is async, add try/catch around the whole block or .catch per fetch):
```tsx
const confirmDelete = async () => {
  if (!deleteDialog) return
  try {
    if (deleteDialog.type === 'single') {
      await fetch(`/api/transactions/${deleteDialog.ids[0]}`, { method: 'DELETE' })
    } else {
      await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: deleteDialog.ids }),
      })
    }
  } catch { /* network error — ignore, data will refresh */ }
  setDeleteDialog(null)
  setSelected(new Set())
  await fetchTransactions(page)
}
```

**Step 2: Add .catch() to filter-bar.tsx fetch chains**

Lines 123,126:
```tsx
useEffect(() => {
  let cancelled = false
  fetch('/api/categories').then(r => r.json()).then(data => {
    if (!cancelled) setCategories(data)
  }).catch(() => {})
  fetch('/api/documents').then(r => r.json()).then(data => {
    if (!cancelled) setDocuments(data)
  }).catch(() => {})
  return () => { cancelled = true }
}, [])
```

**Step 3: Clean up duplicate fetch in transaction-table.tsx**

Remove the unused `fetchTransactions` useCallback (lines 84-89) since the useEffect at line 91-101 duplicates it. BUT — `fetchTransactions` IS used by `updateTransactions` and `confirmDelete`. So keep it. The real issue is: both the useCallback AND the useEffect do the same fetch. Consolidate by having the useEffect call `fetchTransactions`:

```tsx
const fetchTransactions = useCallback(async (currentPage: number) => {
  const params = buildParams(filters, currentPage, sortBy, sortOrder)
  const data = await fetch(`/api/transactions?${params}`).then(r => r.json()).catch(() => null)
  if (data) {
    setTransactions(data.transactions)
    setTotal(data.total)
  }
}, [filters, sortBy, sortOrder])

useEffect(() => {
  fetchTransactions(page)
}, [fetchTransactions, refreshKey, page])
```

This replaces both the old useCallback AND the duplicated useEffect fetch.

**Step 4: Run lint and tests**

Run: `npm run lint && npm test`
Expected: Pass

**Step 5: Commit**

```bash
git add src/components/transaction-table.tsx src/components/filter-bar.tsx
git commit -m "fix: add missing .catch() handlers to prevent stuck loading states"
```

---

## Task 3: Extract Shared Chart Theme

**Files:**
- Create: `src/lib/chart-theme.ts`
- Modify: `src/components/reports/spending-bar-chart.tsx`
- Modify: `src/components/reports/spending-trend-chart.tsx`
- Modify: `src/components/reports/savings-rate-chart.tsx`
- Modify: `src/components/reports/mom-comparison-chart.tsx`
- Modify: `src/components/commitment-trend-chart.tsx`
- Modify: `src/components/commitment-row-detail.tsx`

**Step 1: Create chart-theme.ts**

```ts
export const CHART_COLORS = {
  light: {
    text: '#737373',
    grid: '#E5E5E5',
    fg: '#0A0A0A',
    bg: '#FFFFFF',
    cardBg: '#111113',
    green: '#10B981',
    red: '#F43F5E',
    stroke: '#525252',
    dotFill: '#FFFFFF',
  },
  dark: {
    text: '#A1A1AA',
    grid: '#27272A',
    fg: '#FAFAFA',
    bg: '#18181B',
    cardBg: '#111113',
    green: '#34D399',
    red: '#FB7185',
    stroke: '#A1A1AA',
    dotFill: '#18181B',
  },
} as const

export type ChartTheme = (typeof CHART_COLORS)['light']

export function getChartColors(isDark: boolean): ChartTheme {
  return isDark ? CHART_COLORS.dark : CHART_COLORS.light
}
```

**Step 2: Update all chart components to use shared theme**

In each chart component, replace the inline color variables with:

```tsx
import { getChartColors } from '@/lib/chart-theme'
// ...
const colors = getChartColors(isDark)
// Then use colors.text, colors.grid, colors.fg, etc.
```

For example, `spending-bar-chart.tsx` changes from:
```tsx
const textColor = isDark ? '#A1A1AA' : '#737373'
const gridColor = isDark ? '#27272A' : '#E5E5E5'
const cardBg = isDark ? '#111113' : '#FFFFFF'
const barColor = isDark ? '#FAFAFA' : '#0A0A0A'
```
to:
```tsx
const colors = getChartColors(isDark)
// use colors.text, colors.grid, colors.cardBg, colors.fg
```

Apply the same pattern to all 6 chart components.

**Step 3: Run lint and tests**

Run: `npm run lint && npm test`

**Step 4: Commit**

```bash
git add src/lib/chart-theme.ts src/components/reports/ src/components/commitment-trend-chart.tsx src/components/commitment-row-detail.tsx
git commit -m "refactor: extract shared chart theme constants"
```

---

## Task 4: API Route Error Handling

**Files:**
- Modify: `src/app/api/commitments/status/route.ts`
- Modify: `src/app/api/commitments/exclude/route.ts`
- Modify: `src/app/api/commitments/merge/route.ts`
- Modify: `src/app/api/commitments/override/route.ts`
- Modify: `src/app/api/transactions/route.ts`
- Modify: `src/app/api/transactions/[id]/route.ts`
- Modify: `src/app/api/accounts/[id]/route.ts`
- Modify: `src/app/api/accounts/merge/route.ts`
- Modify: `src/app/api/accounts/detect/route.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/reset/route.ts`

**Step 1: Wrap all `request.json()` calls in try/catch**

For routes that have bare `await request.json()` without error handling, wrap in try/catch to return 400 on malformed JSON. Pattern:

```ts
let body
try {
  body = await request.json()
} catch {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
}
```

Apply to all routes listed above that don't already have this protection. The ones with existing try/catch (like `insights/dismiss/route.ts`) are already safe. The `commitments/normalize/route.ts` uses `.catch(() => ({}))` which is also fine.

**Step 2: Run lint and tests**

Run: `npm run lint && npm test`

**Step 3: Commit**

```bash
git add "src/app/api/"
git commit -m "fix: add JSON parse error handling to all API routes"
```

---

## Task 5: Dependency Cleanup, Stale Docs Removal & CLAUDE.md Update

**Files:**
- Modify: `package.json` (remove `tw-animate-css`)
- Delete: all 31 design/plan docs in `docs/plans/` (all features are implemented)
- Keep: `docs/plans/2026-02-08-add-docker.md` (unimplemented feature — keep for reference)
- Modify: `CLAUDE.md` (add missing module references)

**Step 1: Remove unused dependency**

```bash
npm uninstall tw-animate-css
```

**Step 2: Remove stale design docs**

Delete all implemented plan files from `docs/plans/` EXCEPT `2026-02-08-add-docker.md` (unimplemented). These are historical — the git history preserves them.

**Step 3: Update CLAUDE.md**

Add these missing entries to the project structure section:
- `src/lib/chart-theme.ts` — Shared chart color constants (new file from Task 3)
- `src/lib/filters.ts` — `VALID_TRANSACTION_FILTER` constant for query param validation
- `src/lib/date-presets.ts` — Date range preset helpers for filter bar

**Step 4: Run build to verify nothing broke**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add package.json package-lock.json CLAUDE.md docs/plans/
git commit -m "chore: remove unused deps, clean stale docs, update CLAUDE.md"
```
