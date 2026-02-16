# Recurring Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the recurring charges page around subscription lifecycle status (Active/Ended/Not-Recurring) with expandable row details, spending trend chart, category grouping, and tighter detection heuristics.

**Architecture:** Replace `dismissed_subscriptions` table with `subscription_status` table supporting three statuses. Enhance detection to exclude transfer categories and raise thresholds. Add trend data computation to the API. Rebuild the page with status sections, expandable rows with transaction detail + sparkline, and a Recharts area chart.

**Tech Stack:** Next.js App Router, better-sqlite3, Recharts, shadcn/ui, Tailwind CSS v4, lucide-react

---

### Task 1: Database — subscription_status table + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (initializeSchema function, around line 227-234)
- Test: `src/__tests__/lib/db/recurring.test.ts`

**Step 1: Write failing tests for subscription_status DB functions**

Add to `src/__tests__/lib/db/recurring.test.ts`:

```typescript
import {
  getRecurringCharges, mergeMerchants, dismissMerchant, getDismissedMerchants,
  setSubscriptionStatus, getSubscriptionStatuses, getExcludedMerchants
} from '@/lib/db/recurring'

describe('subscription_status', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')
  })

  it('sets and retrieves subscription status', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('Netflix')).toMatchObject({ status: 'ended' })
  })

  it('upserts status on repeat calls', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    setSubscriptionStatus(db, 'Netflix', 'not_recurring', 'Not a subscription')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('Netflix')?.status).toBe('not_recurring')
    expect(statuses.get('Netflix')?.notes).toBe('Not a subscription')
  })

  it('removes status when set to active', () => {
    setSubscriptionStatus(db, 'Netflix', 'ended')
    setSubscriptionStatus(db, 'Netflix', 'active')
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.has('Netflix')).toBe(false)
  })

  it('getExcludedMerchants returns not_recurring merchants', () => {
    setSubscriptionStatus(db, 'Chipotle', 'not_recurring')
    setSubscriptionStatus(db, 'Netflix', 'ended')
    const excluded = getExcludedMerchants(db)
    expect(excluded.has('Chipotle')).toBe(true)
    expect(excluded.has('Netflix')).toBe(false)
  })

  it('migrates dismissed_subscriptions to subscription_status', () => {
    // Insert into old table directly
    db.prepare("INSERT INTO dismissed_subscriptions (normalized_merchant) VALUES ('OldMerchant')").run()
    // Re-run schema to trigger migration
    initializeSchema(db)
    const statuses = getSubscriptionStatuses(db)
    expect(statuses.get('OldMerchant')?.status).toBe('not_recurring')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/lib/db/recurring.test.ts`
Expected: FAIL — `setSubscriptionStatus` and others not exported

**Step 3: Add subscription_status table to schema.ts**

In `src/lib/db/schema.ts`, after the `dismissed_subscriptions` CREATE TABLE block (line ~234), add:

```typescript
  // Subscription status table (replaces dismissed_subscriptions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_merchant TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ended', 'not_recurring')),
      status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    )
  `)

  // Migrate dismissed_subscriptions → subscription_status
  db.exec(`
    INSERT OR IGNORE INTO subscription_status (normalized_merchant, status, status_changed_at)
    SELECT normalized_merchant, 'not_recurring', dismissed_at
    FROM dismissed_subscriptions
  `)
```

Note: `active` status = no row (delete from table), so the CHECK constraint only allows `ended` and `not_recurring`.

**Step 4: Implement DB functions in recurring.ts**

Add to `src/lib/db/recurring.ts`:

```typescript
export interface SubscriptionStatusEntry {
  status: 'ended' | 'not_recurring'
  statusChangedAt: string
  notes: string | null
}

export function setSubscriptionStatus(
  db: Database.Database,
  merchant: string,
  status: 'active' | 'ended' | 'not_recurring',
  notes?: string
): void {
  if (status === 'active') {
    db.prepare('DELETE FROM subscription_status WHERE normalized_merchant = ?').run(merchant)
  } else {
    db.prepare(`
      INSERT INTO subscription_status (normalized_merchant, status, notes)
      VALUES (?, ?, ?)
      ON CONFLICT(normalized_merchant) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        status_changed_at = datetime('now')
    `).run(merchant, status, notes ?? null)
  }
}

export function getSubscriptionStatuses(db: Database.Database): Map<string, SubscriptionStatusEntry> {
  const rows = db.prepare(
    'SELECT normalized_merchant, status, status_changed_at, notes FROM subscription_status'
  ).all() as Array<{ normalized_merchant: string; status: 'ended' | 'not_recurring'; status_changed_at: string; notes: string | null }>
  const map = new Map<string, SubscriptionStatusEntry>()
  for (const r of rows) {
    map.set(r.normalized_merchant, { status: r.status, statusChangedAt: r.status_changed_at, notes: r.notes })
  }
  return map
}

export function getExcludedMerchants(db: Database.Database): Set<string> {
  const rows = db.prepare(
    "SELECT normalized_merchant FROM subscription_status WHERE status = 'not_recurring'"
  ).all() as Array<{ normalized_merchant: string }>
  return new Set(rows.map(r => r.normalized_merchant))
}
```

**Step 5: Update mergeMerchants to clean up subscription_status**

In `src/lib/db/recurring.ts`, update the `mergeMerchants` function to also clean up `subscription_status` for merged-away merchants (same pattern as existing `dismissed_subscriptions` cleanup):

```typescript
// Inside the transaction, after the dismissed_subscriptions cleanup:
if (mergedAway.length > 0) {
  const statusPlaceholders = mergedAway.map(() => '?').join(', ')
  db.prepare(
    `DELETE FROM subscription_status WHERE normalized_merchant IN (${statusPlaceholders})`
  ).run(...mergedAway)
}
```

**Step 6: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/lib/db/recurring.test.ts`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/recurring.ts src/__tests__/lib/db/recurring.test.ts
git commit -m "feat: add subscription_status table with migration from dismissed_subscriptions"
```

---

### Task 2: Detection improvements — tighter thresholds + exclude transfers

**Files:**
- Modify: `src/lib/recurring.ts`
- Modify: `src/lib/db/recurring.ts` (getRecurringCharges query)
- Test: `src/__tests__/lib/recurring.test.ts`
- Test: `src/__tests__/lib/db/recurring.test.ts`

**Step 1: Write failing tests for tighter thresholds**

Add to `src/__tests__/lib/recurring.test.ts`:

```typescript
it('requires at least 3 occurrences (raised from 2)', () => {
  const transactions = [
    { id: 1, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    { id: 2, date: '2025-02-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
  ]
  const groups = detectRecurringGroups(transactions)
  expect(groups).toHaveLength(0)
})

it('rejects groups with CV > 25%', () => {
  // CV ~28% — passes old threshold (30%) but fails new (25%)
  const transactions = [
    { id: 1, date: '2025-01-15', description: 'SaaS', normalized_merchant: 'SaaS Co', amount: 10.00, type: 'debit' as const, category_name: null, category_color: null },
    { id: 2, date: '2025-02-15', description: 'SaaS', normalized_merchant: 'SaaS Co', amount: 13.50, type: 'debit' as const, category_name: null, category_color: null },
    { id: 3, date: '2025-03-15', description: 'SaaS', normalized_merchant: 'SaaS Co', amount: 8.50, type: 'debit' as const, category_name: null, category_color: null },
  ]
  const groups = detectRecurringGroups(transactions)
  expect(groups).toHaveLength(0)
})
```

**Step 2: Run tests to verify new tests fail (old ones that used 2 occurrences also fail)**

Run: `npm run test -- src/__tests__/lib/recurring.test.ts`
Expected: FAIL — the 2-occurrence tests still pass, and the new "requires 3" test fails

**Step 3: Update detection thresholds in recurring.ts**

In `src/lib/recurring.ts`:

1. Change `if (txns.length < 2) continue` → `if (txns.length < 3) continue` (line 58)
2. Change `if (coefficientOfVariation > 0.3) continue` → `if (coefficientOfVariation > 0.25) continue` (line 80)

**Step 4: Fix existing tests that relied on 2 occurrences**

Several existing tests use only 2 transactions. Update them to use 3 transactions:

- "groups transactions by normalized_merchant" — add a 3rd Netflix transaction
- "excludes charges on the same date" — still valid (2 same-date = 0 distinct dates after dedup)
- "includes charges with consistent amounts" — already has 3
- "excludes charges within 14 days" — still valid (span < 14 days)
- "detects yearly frequency" — add a 3rd yearly transaction (2026-03-01)
- "sorts groups by total amount descending" — add 3rd transaction for each merchant
- "includes transaction IDs, first and last dates" — add a 3rd transaction

**Step 5: Write failing test for excluding transfer categories**

Add to `src/__tests__/lib/db/recurring.test.ts`:

```typescript
it('excludes transactions in transfer categories from recurring detection', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
    { date: '2025-02-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
    { date: '2025-03-15', description: 'TRANSFER TO SAVINGS', amount: 500, type: 'debit' },
  ])
  db.prepare("UPDATE transactions SET normalized_merchant = 'Savings Transfer'").run()
  // Assign Transfer category (which has exclude_from_totals = 1)
  const transferCat = db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }
  db.prepare('UPDATE transactions SET category_id = ?').run(transferCat.id)

  const groups = getRecurringCharges(db, {})
  expect(groups).toHaveLength(0)
})
```

**Step 6: Update getRecurringCharges query to exclude transfer categories**

In `src/lib/db/recurring.ts`, add a JOIN + WHERE condition:

```typescript
const conditions: string[] = [
  "t.type = 'debit'",
  "t.normalized_merchant IS NOT NULL",
  "COALESCE(c.exclude_from_totals, 0) = 0"
]
```

This filters out Transfer, Refund, Savings, Investments categories at the DB query level.

**Step 7: Run all tests**

Run: `npm run test -- src/__tests__/lib/recurring.test.ts src/__tests__/lib/db/recurring.test.ts`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/lib/recurring.ts src/lib/db/recurring.ts src/__tests__/lib/recurring.test.ts src/__tests__/lib/db/recurring.test.ts
git commit -m "feat: tighten recurring detection — 3+ occurrences, 25% CV, exclude transfers"
```

---

### Task 3: API — enhanced GET /api/recurring + new POST /api/recurring/status

**Files:**
- Modify: `src/app/api/recurring/route.ts`
- Create: `src/app/api/recurring/status/route.ts`
- Modify: `src/app/api/recurring/merge/route.ts` (subscription_status cleanup)

**Step 1: Update GET /api/recurring to return status-segmented response + trend data**

Replace `src/app/api/recurring/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getRecurringCharges, getSubscriptionStatuses, getExcludedMerchants } from '@/lib/db/recurring'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const startDate = params.get('start_date')
  const endDate = params.get('end_date')

  const excludedMerchants = getExcludedMerchants(db)
  const statuses = getSubscriptionStatuses(db)

  const allGroups = getRecurringCharges(db, {
    start_date: startDate && DATE_RE.test(startDate) ? startDate : undefined,
    end_date: endDate && DATE_RE.test(endDate) ? endDate : undefined,
    excludeMerchants: excludedMerchants,
  })

  const activeGroups = []
  const endedGroups = []

  for (const g of allGroups) {
    const entry = statuses.get(g.merchantName)
    if (entry?.status === 'ended') {
      const hasUnexpected = g.lastDate > entry.statusChangedAt
      endedGroups.push({ ...g, statusChangedAt: entry.statusChangedAt, unexpectedActivity: hasUnexpected })
    } else {
      activeGroups.push(g)
    }
  }

  // Excluded merchants list (name + date only)
  const excludedList = []
  for (const [merchant, entry] of statuses) {
    if (entry.status === 'not_recurring') {
      excludedList.push({ merchant, excludedAt: entry.statusChangedAt })
    }
  }

  const activeMonthly = activeGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
  const endedWasMonthly = endedGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)

  // Trend data: monthly totals for active recurring charges
  const trendData = computeTrendData(activeGroups)

  return NextResponse.json({
    activeGroups,
    endedGroups,
    excludedMerchants: excludedList,
    summary: {
      activeCount: activeGroups.length,
      activeMonthly: Math.round(activeMonthly * 100) / 100,
      endedCount: endedGroups.length,
      endedWasMonthly: Math.round(endedWasMonthly * 100) / 100,
      excludedCount: excludedList.length,
    },
    trendData,
  })
}

function computeTrendData(groups: Array<{ firstDate: string; lastDate: string; estimatedMonthlyAmount: number }>) {
  if (groups.length === 0) return []

  // Find the date range across all groups
  let minDate = groups[0].firstDate
  let maxDate = groups[0].lastDate
  for (const g of groups) {
    if (g.firstDate < minDate) minDate = g.firstDate
    if (g.lastDate > maxDate) maxDate = g.lastDate
  }

  // Generate month keys from minDate to maxDate
  const months: string[] = []
  const start = new Date(minDate.slice(0, 7) + '-01')
  const end = new Date(maxDate.slice(0, 7) + '-01')
  const cursor = new Date(start)
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // For each month, sum estimated monthly amount of groups active during that month
  return months.map(month => {
    let amount = 0
    for (const g of groups) {
      const gStart = g.firstDate.slice(0, 7)
      const gEnd = g.lastDate.slice(0, 7)
      if (month >= gStart && month <= gEnd) {
        amount += g.estimatedMonthlyAmount
      }
    }
    return { month, amount: Math.round(amount * 100) / 100 }
  })
}
```

**Step 2: Update getRecurringCharges to accept excludeMerchants param**

In `src/lib/db/recurring.ts`, update the `RecurringFilters` interface and function:

```typescript
export interface RecurringFilters {
  start_date?: string
  end_date?: string
  excludeMerchants?: Set<string>
}
```

After calling `detectRecurringGroups(rows)`, filter out excluded merchants:

```typescript
const groups = detectRecurringGroups(rows)
if (filters.excludeMerchants && filters.excludeMerchants.size > 0) {
  return groups.filter(g => !filters.excludeMerchants!.has(g.merchantName))
}
return groups
```

**Step 3: Create POST /api/recurring/status**

Create `src/app/api/recurring/status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { setSubscriptionStatus } from '@/lib/db/recurring'

const VALID_STATUSES = new Set(['active', 'ended', 'not_recurring'])

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { merchant, status, notes } = body ?? {}

  if (typeof merchant !== 'string' || !merchant.trim()) {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'status must be active, ended, or not_recurring' }, { status: 400 })
  }

  const db = getDb()
  setSubscriptionStatus(db, merchant.trim(), status, typeof notes === 'string' ? notes : undefined)
  return NextResponse.json({ success: true })
}
```

**Step 4: Update merge route to clean up subscription_status**

In `src/app/api/recurring/merge/route.ts`, the `mergeMerchants` DB function already handles cleanup (from Task 1 Step 5). No route changes needed.

**Step 5: Run the full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/app/api/recurring/route.ts src/app/api/recurring/status/route.ts src/lib/db/recurring.ts
git commit -m "feat: enhanced recurring API with status segmentation and trend data"
```

---

### Task 4: Recurring spending trend chart component

**Files:**
- Create: `src/components/recurring-trend-chart.tsx`

**Step 1: Create the trend chart component**

This is a Recharts AreaChart showing monthly recurring spend over time. Follow existing chart conventions from `src/components/reports/` — explicit hex colors (no CSS vars in SVG), 240px height, `axisLine={false} tickLine={false}`.

```typescript
'use client'

import { Card } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/format'
import { useTheme } from 'next-themes'

interface TrendDataPoint {
  month: string
  amount: number
}

interface RecurringTrendChartProps {
  data: TrendDataPoint[]
}

export function RecurringTrendChart({ data }: RecurringTrendChartProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const lineColor = isDark ? '#FAFAFA' : '#0A0A0A'

  if (data.length === 0) return null

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Recurring Spend</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: textColor }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => {
              const [y, m] = v.split('-')
              return `${m}/${y.slice(2)}`
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: textColor }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCurrency(v)}
            width={60}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(Number(value)), 'Monthly']}
            labelFormatter={(label: string) => {
              const [y, m] = label.split('-')
              const date = new Date(Number(y), Number(m) - 1)
              return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }}
            contentStyle={{
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              border: `1px solid ${gridColor}`,
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: textColor }}
            itemStyle={{ color: isDark ? '#FAFAFA' : '#0A0A0A' }}
            cursor={false}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={lineColor}
            fill={isDark ? '#27272A' : '#E5E5E5'}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/recurring-trend-chart.tsx
git commit -m "feat: add recurring spending trend area chart component"
```

---

### Task 5: Expandable row detail component

**Files:**
- Create: `src/components/recurring-row-detail.tsx`

**Step 1: Create the expandable detail component**

Shows transaction history on left, cost sparkline on right when a row is expanded.

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LineChart, Line, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrencyPrecise } from '@/lib/format'
import { useTheme } from 'next-themes'

interface Transaction {
  id: number
  date: string
  description: string
  amount: number
}

interface RecurringRowDetailProps {
  transactionIds: number[]
}

export function RecurringRowDetail({ transactionIds }: RecurringRowDetailProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    if (transactionIds.length === 0) { setLoading(false); return }
    fetch(`/api/transactions?ids=${transactionIds.join(',')}`)
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [transactionIds])

  if (loading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">Loading...</div>
  }

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  const avgAmount = sorted.length > 0 ? sorted.reduce((s, t) => s + t.amount, 0) / sorted.length : 0
  const chartData = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({ date: t.date, amount: t.amount }))

  const lineColor = isDark ? '#FAFAFA' : '#0A0A0A'
  const refColor = isDark ? '#3F3F46' : '#D4D4D8'

  return (
    <div className="grid grid-cols-[1fr_200px] gap-4 px-4 py-3 bg-muted/30">
      <div className="max-h-48 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="py-1 text-[11px]">Date</TableHead>
              <TableHead className="py-1 text-[11px]">Description</TableHead>
              <TableHead className="py-1 text-[11px] text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(t => (
              <TableRow key={t.id}>
                <TableCell className="py-1 text-[11px] tabular-nums text-muted-foreground">{t.date}</TableCell>
                <TableCell className="py-1 text-[11px] truncate max-w-[200px]">{t.description}</TableCell>
                <TableCell className="py-1 text-[11px] text-right tabular-nums">{formatCurrencyPrecise(t.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted-foreground mb-1">Cost Trend</span>
        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <ReferenceLine y={avgAmount} stroke={refColor} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="amount" stroke={lineColor} strokeWidth={1.5} dot={{ r: 2, fill: lineColor }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <span className="text-[11px] text-muted-foreground">Not enough data</span>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Add API support for fetching transactions by IDs**

In `src/app/api/transactions/route.ts`, add support for an `ids` query param. Check the existing route to see how it handles params, then add:

```typescript
// Inside the GET handler, after existing param parsing:
const idsParam = params.get('ids')
if (idsParam) {
  const ids = idsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
  if (ids.length === 0) return NextResponse.json({ transactions: [] })
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT id, date, description, amount, type FROM transactions WHERE id IN (${placeholders})
  `).all(...ids)
  return NextResponse.json({ transactions: rows })
}
```

**Step 3: Commit**

```bash
git add src/components/recurring-row-detail.tsx src/app/api/transactions/route.ts
git commit -m "feat: add expandable row detail with transaction history and sparkline"
```

---

### Task 6: Rebuild the recurring charges table with expandable rows and status actions

**Files:**
- Modify: `src/components/recurring-charges-table.tsx`

**Step 1: Add expandable row support and status action buttons**

Update `RecurringChargesTableProps` to include:
- `onStatusChange?: (merchant: string, status: 'ended' | 'not_recurring') => void` — replaces `onDismiss`
- `expandedMerchant?: string | null` — which row is expanded
- `onToggleExpand?: (merchant: string) => void`

Replace the dismiss X button with a dropdown or two small action buttons: "End" (CircleStop icon) and "Exclude" (Ban icon).

When a row is clicked (not on a button/checkbox), toggle expand and render `<RecurringRowDetail>` in a full-width `<TableRow>` below.

Key changes:
- Add `ChevronRight`/`ChevronDown` icon in first column to indicate expandable
- On row click → toggle `expandedMerchant`
- Render `<RecurringRowDetail transactionIds={group.transactionIds} />` in a colspan row when expanded
- Replace single dismiss X with "End" and "Exclude" ghost buttons
- Add `unexpectedActivity` badge support for ended groups

**Step 2: Commit**

```bash
git add src/components/recurring-charges-table.tsx
git commit -m "feat: recurring table with expandable rows and status action buttons"
```

---

### Task 7: Rebuild the subscriptions page with status sections + category grouping

**Files:**
- Modify: `src/app/(app)/subscriptions/page.tsx`

**Step 1: Rewrite the page with three status sections**

Major changes to the page:
1. Update `RecurringData` interface to match new API shape (`activeGroups`, `endedGroups`, `excludedMerchants`, enhanced `summary`, `trendData`)
2. Add `RecurringTrendChart` at the top
3. Update summary cards to show Active/Ended/Excluded counts
4. **Active section**: Group by category with collapsible groups and subtotals. Each category group has a header with category name + monthly subtotal, and contains the subscription rows for that category. Uncategorized items go in "Other" group.
5. **Ended section**: Collapsible, shows ended subscriptions with `unexpectedActivity` warning badges. Row actions: Reactivate, Mark Not Recurring
6. **Excluded section**: Collapsible, simple list with merchant name + exclusion date + Restore button
7. Replace all `fetch('/api/recurring/dismiss', ...)` calls with `fetch('/api/recurring/status', ...)` calls
8. Add `expandedMerchant` state and pass to table
9. Keep merge dialog, sort state, normalize button

Category grouping helper:

```typescript
function groupByCategory(groups: RecurringGroup[]): Map<string, RecurringGroup[]> {
  const map = new Map<string, RecurringGroup[]>()
  for (const g of groups) {
    const key = g.category ?? 'Other'
    const list = map.get(key) ?? []
    list.push(g)
    map.set(key, list)
  }
  return map
}
```

Each category group renders as a collapsible section with its own header showing category name + monthly subtotal, containing a `RecurringChargesTable` for just those rows (no pagination per group — pagination is at the top level).

**Step 2: Commit**

```bash
git add "src/app/(app)/subscriptions/page.tsx"
git commit -m "feat: redesigned recurring page with status sections and category grouping"
```

---

### Task 8: Remove deprecated dismiss route + cleanup

**Files:**
- Delete: `src/app/api/recurring/dismiss/route.ts`
- Verify no other code references the dismiss endpoint

**Step 1: Search for dismiss endpoint references**

Search for `/api/recurring/dismiss` across the codebase. Should only appear in the old dismiss route itself (now replaced by status route) and possibly in tests.

**Step 2: Delete the dismiss route**

```bash
rm src/app/api/recurring/dismiss/route.ts
```

If there's a `src/app/api/recurring/dismiss/` directory, remove it entirely.

**Step 3: Update any remaining references**

If any test files reference the dismiss endpoint, update them to use the status endpoint instead.

**Step 4: Run the full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated dismiss route, replaced by /api/recurring/status"
```

---

### Task 9: Build verification

**Step 1: Run production build**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 2: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 3: Manual smoke test**

Run: `npm run dev`
- Navigate to /subscriptions
- Verify trend chart renders
- Verify active subscriptions grouped by category
- Click a row to expand — see transaction history + sparkline
- Mark a subscription as "Ended" — moves to Ended section
- Mark a subscription as "Not Recurring" — moves to Excluded section
- Restore from both sections
- Test merge dialog still works
- Test date range filters + presets
