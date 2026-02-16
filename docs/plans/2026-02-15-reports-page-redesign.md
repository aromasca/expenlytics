# Reports Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve reports page readability, fix dark mode issues, add savings rate + MoM comparison modules, redesign Sankey with drill-down, and standardize number formatting app-wide.

**Architecture:** Shared formatting utility consumed by all components. Sankey refactored to 2-level with expand/collapse state. Two new Recharts chart components. New DB query for MoM comparison. Savings rate computed client-side from existing trend data.

**Tech Stack:** React, Recharts, d3-sankey, Intl.NumberFormat, shadcn/ui, better-sqlite3

---

### Task 1: Shared Currency Formatting Utility

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/__tests__/lib/format.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/__tests__/lib/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats large numbers with commas and no decimals', () => {
    expect(formatCurrency(100123.35)).toBe('$100,123')
  })

  it('formats small numbers', () => {
    expect(formatCurrency(42.99)).toBe('$43')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0')
  })

  it('formats negative numbers', () => {
    expect(formatCurrency(-1500.75)).toBe('-$1,501')
  })
})

describe('formatCurrencyPrecise', () => {
  it('formats with 2 decimal places and commas', () => {
    expect(formatCurrencyPrecise(100123.35)).toBe('$100,123.35')
  })

  it('formats small numbers with cents', () => {
    expect(formatCurrencyPrecise(42.5)).toBe('$42.50')
  })

  it('formats zero', () => {
    expect(formatCurrencyPrecise(0)).toBe('$0.00')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/format.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/format.ts
const currencyRound = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const currencyPrecise = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return currencyRound.format(amount)
}

export function formatCurrencyPrecise(amount: number): string {
  return currencyPrecise.format(amount)
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/format.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/format.ts src/__tests__/lib/format.test.ts
git commit -m "feat: add shared currency formatting utility"
```

---

### Task 2: Apply formatCurrency to Reports Components

**Files:**
- Modify: `src/components/reports/summary-cards.tsx` (lines 15, 19, 23, 28)
- Modify: `src/components/reports/spending-bar-chart.tsx` (lines 30, 32)
- Modify: `src/components/reports/category-pie-chart.tsx` (line 50)
- Modify: `src/components/reports/spending-trend-chart.tsx` (lines 30, 32)
- Modify: `src/components/reports/top-transactions-table.tsx` (line 42)
- Modify: `src/components/reports/sankey-chart.tsx` (line 33 — already uses Intl, replace with shared)

**Step 1: Update SummaryCards**

Replace all `$${value.toFixed(2)}` with `formatCurrency(value)`:

```typescript
// src/components/reports/summary-cards.tsx
import { formatCurrency } from '@/lib/format'
// ...
<p className="text-xl font-semibold tabular-nums mt-0.5">{formatCurrency(totalSpent)}</p>
// ... same for totalIncome, avgMonthly, topCategory.amount
```

**Step 2: Update SpendingBarChart**

```typescript
// src/components/reports/spending-bar-chart.tsx
import { formatCurrency } from '@/lib/format'
// YAxis tickFormatter:
tickFormatter={(v) => formatCurrency(v)}
// Tooltip formatter:
formatter={(value) => [formatCurrency(Number(value)), 'Spent']}
```

**Step 3: Update CategoryPieChart**

```typescript
// src/components/reports/category-pie-chart.tsx
import { formatCurrency } from '@/lib/format'
// Tooltip formatter:
formatter={(value) => formatCurrency(Number(value))}
```

**Step 4: Update SpendingTrendChart**

```typescript
// src/components/reports/spending-trend-chart.tsx
import { formatCurrency } from '@/lib/format'
// YAxis tickFormatter:
tickFormatter={(v) => formatCurrency(v)}
// Tooltip formatter:
formatter={(value) => formatCurrency(Number(value))}
```

**Step 5: Update TopTransactionsTable**

```typescript
// src/components/reports/top-transactions-table.tsx
import { formatCurrencyPrecise } from '@/lib/format'
// Amount cell:
{txn.type === 'credit' ? '+' : '-'}{formatCurrencyPrecise(txn.amount)}
```

Note: TopTransactionsTable shows individual transactions so use `formatCurrencyPrecise` (with cents).

**Step 6: Update SankeyChart**

```typescript
// src/components/reports/sankey-chart.tsx
import { formatCurrency } from '@/lib/format'
// Remove line 33 (const fmt = new Intl.NumberFormat...)
// Replace all fmt.format(...) with formatCurrency(...)
```

**Step 7: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 8: Commit**

```bash
git add src/components/reports/
git commit -m "feat: apply shared currency formatting to all reports components"
```

---

### Task 3: Apply formatCurrency to Non-Reports Pages

**Files:**
- Modify: `src/components/transaction-table.tsx` (line 193)
- Modify: `src/components/recurring-charges-table.tsx` (lines 119-120)
- Modify: `src/app/(app)/subscriptions/page.tsx` (lines 247, 251, 279)
- Modify: `src/components/insights/income-outflow-chart.tsx` (lines 29, 40)

**Step 1: Update transaction-table.tsx**

```typescript
import { formatCurrencyPrecise } from '@/lib/format'
// Line 193: replace ${txn.amount.toFixed(2)} with {formatCurrencyPrecise(txn.amount)}
```

**Step 2: Update recurring-charges-table.tsx**

```typescript
import { formatCurrencyPrecise } from '@/lib/format'
// Line 119: replace ${group.avgAmount.toFixed(2)} with {formatCurrencyPrecise(group.avgAmount)}
// Line 120: replace ${group.estimatedMonthlyAmount.toFixed(2)} with {formatCurrencyPrecise(group.estimatedMonthlyAmount)}
```

**Step 3: Update subscriptions/page.tsx**

```typescript
import { formatCurrency } from '@/lib/format'
// Line 247: replace ${data.summary.totalMonthly.toFixed(2)} with {formatCurrency(data.summary.totalMonthly)}
// Line 251: replace ${data.summary.totalYearly.toFixed(2)} with {formatCurrency(data.summary.totalYearly)}
// Line 279: replace ${group.estimatedMonthlyAmount.toFixed(2)} with {formatCurrency(group.estimatedMonthlyAmount)}
```

**Step 4: Update income-outflow-chart.tsx**

```typescript
import { formatCurrency } from '@/lib/format'
// Line 29: tickFormatter={(v: number) => formatCurrency(v)}
// Line 40: formatter={(value: number | undefined) => [formatCurrency(Number(value)), '']}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/transaction-table.tsx src/components/recurring-charges-table.tsx "src/app/(app)/subscriptions/page.tsx" src/components/insights/income-outflow-chart.tsx
git commit -m "feat: apply shared currency formatting to transactions, subscriptions, and insights"
```

---

### Task 4: Category Pie Chart — Legend, Tooltip, and Label Fixes

**Files:**
- Modify: `src/components/reports/category-pie-chart.tsx`

**Step 1: Fix legend position**

Move legend below chart. Replace `<Legend>` props:

```tsx
<Legend
  verticalAlign="bottom"
  align="center"
  wrapperStyle={{ color: textColor, fontSize: '11px', paddingTop: '8px' }}
  iconType="circle"
  iconSize={8}
/>
```

**Step 2: Fix dark mode tooltip text**

The tooltip `contentStyle` already sets `color: fgColor`, but Recharts overrides item text color. Add explicit `itemStyle` and `labelStyle`:

```tsx
<Tooltip
  formatter={(value) => formatCurrency(Number(value))}
  contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px' }}
  itemStyle={{ color: fgColor }}
  labelStyle={{ color: fgColor }}
  cursor={false}
/>
```

**Step 3: Fix slice labels — only show on slices > 5%**

Replace the simple `label={{ fill: fgColor, fontSize: 11 }}` with a custom label renderer:

```tsx
<Pie
  data={chartData}
  dataKey="amount"
  nameKey="category"
  cx="50%"
  cy="50%"
  innerRadius={55}
  outerRadius={85}
  paddingAngle={2}
  label={({ percentage, x, y, textAnchor }) =>
    percentage > 5 ? (
      <text x={x} y={y} textAnchor={textAnchor} fill={fgColor} fontSize={11}>
        {percentage.toFixed(0)}%
      </text>
    ) : null
  }
>
```

Note: The `percentage` field is already in the data passed to the chart.

**Step 4: Increase chart height slightly to accommodate bottom legend**

Change `height={240}` to `height={280}` in the `<ResponsiveContainer>`.

**Step 5: Verify visually**

Run: `npm run dev`
Check: Dark mode tooltip text visible, legend below chart, small slices unlabeled.

**Step 6: Commit**

```bash
git add src/components/reports/category-pie-chart.tsx
git commit -m "fix: pie chart legend overlap, dark mode tooltip, and small slice labels"
```

---

### Task 5: Date Picker Dark Mode Fix + New Presets

**Files:**
- Modify: `src/app/(app)/reports/page.tsx`

**Step 1: Fix dark mode calendar icon**

Add `dark:[color-scheme:dark]` to date input className:

```tsx
<Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-32 h-8 text-xs dark:[color-scheme:dark]" />
// Same for endDate input
```

**Step 2: Replace date presets**

Replace the `getDatePreset` function and preset buttons:

```typescript
function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  switch (preset) {
    case '1mo': {
      const d = new Date(yyyy, now.getMonth() - 1, now.getDate())
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case '3mo': {
      const d = new Date(yyyy, now.getMonth() - 3, now.getDate())
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case '6mo': {
      const d = new Date(yyyy, now.getMonth() - 6, now.getDate())
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case '1yr': {
      const d = new Date(yyyy - 1, now.getMonth(), now.getDate())
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    default:
      return { start: '', end: '' }
  }
}
```

Replace preset button array:

```tsx
{[
  { label: '1mo', value: '1mo' },
  { label: '3mo', value: '3mo' },
  { label: '6mo', value: '6mo' },
  { label: '1yr', value: '1yr' },
  { label: 'All', value: 'all' },
].map(p => (
  <Button key={p.value} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => applyPreset(p.value)}>
    {p.label}
  </Button>
))}
```

**Step 3: Verify visually**

Run: `npm run dev`
Check: Calendar icon visible in dark mode, preset buttons work correctly.

**Step 4: Commit**

```bash
git add "src/app/(app)/reports/page.tsx"
git commit -m "fix: date picker dark mode icon + replace presets with 1mo/3mo/6mo/1yr/All"
```

---

### Task 6: Top Transactions — Filter Out Transfers/Refunds

**Files:**
- Modify: `src/lib/db/reports.ts` — `getTopTransactions` function (lines 238-254)

**Step 1: Write the failing test**

```typescript
// Add to existing reports test file or create src/__tests__/lib/db/reports-top-txn.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getTopTransactions } from '@/lib/db/reports'

describe('getTopTransactions', () => {
  it('excludes transfers and refunds', () => {
    const db = new Database(':memory:')
    initializeSchema(db)

    // Get category IDs
    const transfer = db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }
    const groceries = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }

    // Insert a document
    db.prepare("INSERT INTO documents (filename, original_name, status) VALUES ('test.pdf', 'test.pdf', 'complete')").run()

    // Insert a large transfer (should be excluded)
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-15', 'Wire Transfer', 50000, 'debit', ?, 1, 'transfer')").run(transfer.id)

    // Insert a large refund (should be excluded)
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-16', 'Refund', 2000, 'credit', ?, 1, 'refund')").run(groceries.id)

    // Insert a real purchase (should be included)
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, transaction_class) VALUES ('2026-01-17', 'Grocery Store', 150, 'debit', ?, 1, 'purchase')").run(groceries.id)

    const results = getTopTransactions(db, {}, 50)
    expect(results).toHaveLength(1)
    expect(results[0].description).toBe('Grocery Store')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/reports-top-txn.test.ts`
Expected: FAIL — transfer and refund rows included

**Step 3: Update getTopTransactions query**

```typescript
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
    ${where}${where ? ' AND' : ' WHERE'} COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
    ORDER BY t.amount DESC
    LIMIT ?
  `).all([...params, limit]) as TopTransactionRow[]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/reports-top-txn.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/reports.ts src/__tests__/lib/db/reports-top-txn.test.ts
git commit -m "fix: filter transfers and refunds from top transactions"
```

---

### Task 7: Sankey Two-Level Drill-Down

**Files:**
- Modify: `src/components/reports/sankey-chart.tsx` (full rewrite of the layout logic)

This is the most complex task. The Sankey must support two modes:
1. **Collapsed (default):** Income → Category Groups (+ Savings). ~8-12 nodes.
2. **Expanded:** When a group is clicked, it shows Income → Groups → Subcategories for that group only.

**Step 1: Add expandedGroup state**

```typescript
const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
```

**Step 2: Refactor layout useMemo to support two modes**

When `expandedGroup === null`: Build 2-column Sankey (Income → Groups + Savings).
When `expandedGroup === 'Food & Drink'` (example): Build 3-column Sankey but only the expanded group gets subcategory nodes on the right. All other groups are terminal nodes (no right-column children).

```typescript
const layout = useMemo(() => {
  if (data.length === 0) return null

  const totalSpent = data.reduce((s, d) => s + d.amount, 0)
  const savings = Math.max(0, totalIncome - totalSpent)

  // Income sources
  const incomeSources = incomeData.length > 0
    ? incomeData
    : [{ category: 'Income', category_group: 'Income & Transfers', color: incomeColor, amount: totalIncome }]

  // Spending groups
  const groupMap = new Map<string, number>()
  for (const d of data) {
    groupMap.set(d.category_group, (groupMap.get(d.category_group) ?? 0) + d.amount)
  }
  if (savings > 0) groupMap.set('Savings', savings)
  const groups = Array.from(groupMap.entries()).sort((a, b) => b[1] - a[1])

  // Subcategories for expanded group only
  const expandedCats = expandedGroup
    ? data.filter(d => d.category_group === expandedGroup)
    : []

  // Build nodes
  const nodes: NodeExtra[] = [
    ...incomeSources.map(d => ({ name: d.category, color: incomeColor })),
    ...groups.map(([g]) => ({ name: g, color: g === 'Savings' ? savingsColor : groupColor })),
  ]

  if (expandedGroup) {
    nodes.push(...expandedCats.map(d => ({ name: d.category, color: d.color })))
  }

  if (savings > 0 && !expandedGroup) {
    // In collapsed mode, Savings is a terminal group node — no extra node needed
  }
  if (savings > 0 && expandedGroup === 'Savings') {
    nodes.push({ name: 'Net Savings', color: savingsColor })
  }

  const incomeCount = incomeSources.length
  const groupOffset = incomeCount
  const catOffset = groupOffset + groups.length

  const links: Array<{ source: number; target: number; value: number }> = []

  // Income → groups
  const totalIncomeFromSources = incomeSources.reduce((s, d) => s + d.amount, 0)
  for (let i = 0; i < incomeSources.length; i++) {
    const srcFraction = totalIncomeFromSources > 0 ? incomeSources[i].amount / totalIncomeFromSources : 1 / incomeSources.length
    for (let g = 0; g < groups.length; g++) {
      const val = Math.round(groups[g][1] * srcFraction * 100) / 100
      if (val > 0) {
        links.push({ source: i, target: groupOffset + g, value: val })
      }
    }
  }

  // Group → subcategories (only for expanded group)
  if (expandedGroup) {
    const gIdx = groups.findIndex(([g]) => g === expandedGroup)
    for (let c = 0; c < expandedCats.length; c++) {
      links.push({ source: groupOffset + gIdx, target: catOffset + c, value: expandedCats[c].amount })
    }
  }

  // Savings expansion
  if (savings > 0 && expandedGroup === 'Savings') {
    const sIdx = groups.findIndex(([g]) => g === 'Savings')
    links.push({ source: groupOffset + sIdx, target: nodes.length - 1, value: savings })
  }

  const width = 900
  const nodeCount = Math.max(
    incomeSources.length,
    groups.length,
    expandedGroup ? expandedCats.length + (expandedGroup === 'Savings' ? 1 : 0) : 0
  )
  const effectiveNodes = Math.max(incomeSources.length, groups.length, nodeCount)
  const height = Math.max(250, Math.min(500, effectiveNodes * 22 + 40))

  const rightMargin = expandedGroup ? 120 : 40
  const generator = sankey<NodeExtra, LinkExtra>()
    .nodeWidth(12)
    .nodePadding(6)
    .nodeSort(null)
    .extent([[120, 4], [width - rightMargin, height - 4]])

  const graph = generator({
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({ ...l })),
  })

  return { ...graph, width, height, groups, expandedGroup }
}, [data, incomeData, totalIncome, incomeColor, savingsColor, groupColor, expandedGroup])
```

**Step 3: Add click handler on group nodes**

In the node rendering section, make group nodes (depth === max when collapsed, middle column) clickable:

```tsx
<rect
  x={x0}
  y={y0}
  width={x1 - x0}
  height={Math.max(1, nodeHeight)}
  fill={node.color}
  rx={1}
  style={{ cursor: isGroupNode ? 'pointer' : 'default' }}
  onClick={() => {
    if (isGroupNode) {
      setExpandedGroup(prev => prev === node.name ? null : node.name)
    }
  }}
  onMouseEnter={(e) => showTooltip(e, node.name, formatCurrency(node.value ?? 0))}
  onMouseMove={(e) => showTooltip(e, node.name, formatCurrency(node.value ?? 0))}
  onMouseLeave={hideTooltip}
/>
```

Where `isGroupNode` is determined by checking if the node name is in the groups array and is in the middle column (not income source, not subcategory).

**Step 4: Add visual indicator for expandable groups**

Show a small "+" or chevron next to group labels, and "−" when expanded:

```tsx
{nodeHeight > 8 && (
  <text
    x={isLeft ? x0 - 4 : x1 + 4}
    y={(y0 + y1) / 2}
    dy="0.35em"
    textAnchor={isLeft ? 'end' : 'start'}
    fill={textColor}
    fontSize={9}
    fontFamily="system-ui, sans-serif"
    style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: isGroupNode ? 'auto' : 'none', cursor: isGroupNode ? 'pointer' : 'default' }}
    onClick={() => isGroupNode && setExpandedGroup(prev => prev === node.name ? null : node.name)}
  >
    {isGroupNode ? (expandedGroup === node.name ? '▾ ' : '▸ ') : ''}{node.name}
  </text>
)}
```

**Step 5: Show amounts on node labels**

Append formatted amount to node labels for readability:

```tsx
{isGroupNode ? (expandedGroup === node.name ? '▾ ' : '▸ ') : ''}{node.name} {formatCurrency(node.value ?? 0)}
```

**Step 6: Verify visually**

Run: `npm run dev`
Check: Default shows ~8-12 group nodes. Clicking a group expands subcategories. Clicking again collapses.

**Step 7: Commit**

```bash
git add src/components/reports/sankey-chart.tsx
git commit -m "feat: sankey two-level drill-down with click-to-expand groups"
```

---

### Task 8: Savings Rate Chart (New Component)

**Files:**
- Create: `src/components/reports/savings-rate-chart.tsx`

**Step 1: Create the component**

This derives savings rate from the existing trend data (debits/credits per period), so no new DB query needed.

```tsx
'use client'

import { Card } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useTheme } from '@/components/theme-provider'

interface SavingsRateChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SavingsRateChart({ data }: SavingsRateChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const fgColor = isDark ? '#FAFAFA' : '#0A0A0A'

  const chartData = data.map(d => ({
    period: d.period,
    rate: d.credits > 0 ? Math.round(((d.credits - d.debits) / d.credits) * 1000) / 10 : 0,
  }))

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Savings Rate</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isDark ? '#34D399' : '#10B981'} stopOpacity={0.3} />
                <stop offset="100%" stopColor={isDark ? '#34D399' : '#10B981'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke={gridColor} strokeDasharray="3 3" />
            <Tooltip
              formatter={(value: number) => [`${Number(value).toFixed(1)}%`, 'Savings Rate']}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px' }}
              itemStyle={{ color: fgColor }}
              labelStyle={{ color: fgColor }}
              cursor={false}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke={isDark ? '#34D399' : '#10B981'}
              fill="url(#savingsGradient)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/reports/savings-rate-chart.tsx
git commit -m "feat: add savings rate chart component"
```

---

### Task 9: Month-over-Month Comparison — DB Query + Component

**Files:**
- Modify: `src/lib/db/reports.ts` — add `getMoMComparison` function
- Create: `src/components/reports/mom-comparison-chart.tsx`
- Modify: `src/app/api/reports/route.ts` — add `momComparison` to response

**Step 1: Write the DB query**

Add to `src/lib/db/reports.ts`:

```typescript
export interface MoMComparisonRow {
  group: string
  current: number
  previous: number
  delta: number
  percentChange: number
}

export function getMoMComparison(db: Database.Database, filters: ReportFilters): MoMComparisonRow[] {
  // Get the two most recent complete months from the data
  const { type: _type, ...filtersWithoutType } = filters
  const { where, params } = buildWhere(filtersWithoutType)

  const months = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', t.date) as month
    FROM transactions t
    ${where}
    ORDER BY month DESC
    LIMIT 2
  `).all(params) as Array<{ month: string }>

  if (months.length < 2) return []

  const currentMonth = months[0].month
  const previousMonth = months[1].month

  const rows = db.prepare(`
    SELECT
      COALESCE(c.category_group, 'Other') as grp,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as current_amount,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as previous_amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}${where ? ' AND' : ' WHERE'} t.type = 'debit'
      AND COALESCE(c.exclude_from_totals, 0) = 0
      AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
      AND strftime('%Y-%m', t.date) IN (?, ?)
    GROUP BY COALESCE(c.category_group, 'Other')
    HAVING current_amount > 0 OR previous_amount > 0
  `).all([...params, currentMonth, previousMonth, currentMonth, previousMonth]) as Array<{ grp: string; current_amount: number; previous_amount: number }>

  return rows
    .map(r => {
      const delta = r.current_amount - r.previous_amount
      const percentChange = r.previous_amount > 0 ? Math.round((delta / r.previous_amount) * 1000) / 10 : (r.current_amount > 0 ? 100 : 0)
      return {
        group: r.grp,
        current: r.current_amount,
        previous: r.previous_amount,
        delta,
        percentChange,
      }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}
```

**Step 2: Add to API route**

In `src/app/api/reports/route.ts`, import `getMoMComparison` and add to response:

```typescript
import { ..., getMoMComparison } from '@/lib/db/reports'

// After existing queries:
const momComparison = getMoMComparison(db, filters)

return NextResponse.json({
  summary,
  spendingOverTime,
  categoryBreakdown,
  trend,
  topTransactions,
  sankeyData,
  sankeyIncomeData,
  momComparison,
})
```

**Step 3: Create the chart component**

```tsx
// src/components/reports/mom-comparison-chart.tsx
'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'

interface MoMComparisonChartProps {
  data: Array<{ group: string; current: number; previous: number; delta: number; percentChange: number }>
}

export function MoMComparisonChart({ data }: MoMComparisonChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const fgColor = isDark ? '#FAFAFA' : '#0A0A0A'
  const greenColor = isDark ? '#34D399' : '#10B981'
  const redColor = isDark ? '#FB7185' : '#F43F5E'

  // Top 8 groups by |delta|
  const chartData = data.slice(0, 8)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Month-over-Month Change</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">Need at least 2 months of data</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36 + 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
            <XAxis type="number" fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="group" fontSize={11} width={120} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <ReferenceLine x={0} stroke={gridColor} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(Number(value)), 'Change']}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px' }}
              itemStyle={{ color: fgColor }}
              labelStyle={{ color: fgColor }}
              cursor={false}
            />
            <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.delta <= 0 ? greenColor : redColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
```

**Step 4: Commit**

```bash
git add src/lib/db/reports.ts src/app/api/reports/route.ts src/components/reports/mom-comparison-chart.tsx
git commit -m "feat: add month-over-month comparison chart with DB query"
```

---

### Task 10: Wire Up New Components in Reports Page

**Files:**
- Modify: `src/app/(app)/reports/page.tsx`

**Step 1: Add imports**

```typescript
import { SavingsRateChart } from '@/components/reports/savings-rate-chart'
import { MoMComparisonChart } from '@/components/reports/mom-comparison-chart'
```

**Step 2: Update ReportData interface**

```typescript
interface ReportData {
  // ... existing fields
  momComparison: Array<{ group: string; current: number; previous: number; delta: number; percentChange: number }>
}
```

**Step 3: Update layout**

Replace the section after SankeyChart:

```tsx
<SankeyChart data={data.sankeyData} incomeData={data.sankeyIncomeData} totalIncome={data.summary.totalIncome} />

<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <SpendingTrendChart data={data.trend} />
  <SavingsRateChart data={data.trend} />
</div>

<MoMComparisonChart data={data.momComparison} />
<TopTransactionsTable data={data.topTransactions} />
```

**Step 4: Verify visually**

Run: `npm run dev`
Check full page layout, all modules rendering, dark mode working.

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add "src/app/(app)/reports/page.tsx"
git commit -m "feat: wire up savings rate + MoM comparison charts in reports layout"
```

---

### Task 11: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: No type errors, clean build

**Step 3: Visual QA checklist**

Run: `npm run dev` and verify:
- [ ] Numbers formatted with commas everywhere (no raw .toFixed(2))
- [ ] Pie chart legend below chart, tooltip readable in dark mode
- [ ] Date picker calendar icon visible in dark mode
- [ ] Date presets: 1mo, 3mo, 6mo, 1yr, All — all work correctly
- [ ] Sankey shows groups only by default, click expands to subcategories
- [ ] Savings rate chart shows percentage trend
- [ ] MoM comparison shows horizontal bars with green/red
- [ ] Top transactions excludes transfers/refunds
- [ ] Subscriptions page numbers formatted
- [ ] Transactions page numbers formatted
- [ ] Insights page numbers formatted
