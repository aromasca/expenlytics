# Sankey Diagram Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive Sankey diagram to the Reports tab that visualizes money flow from Income → Category Groups → Individual Categories.

**Architecture:** A new DB query aggregates spending by category and category_group. The API returns this as `sankeyData` alongside existing report data. A custom SVG component uses d3-sankey to compute node positions and link paths, rendering an interactive diagram with hover tooltips and theme-aware colors.

**Tech Stack:** d3-sankey + d3-shape for layout computation, custom React SVG rendering, existing report filters.

---

### Task 1: Install d3-sankey dependency

**Files:**
- Modify: `package.json`

**Step 1: Install d3-sankey and types**

Run:
```bash
npm install d3-sankey d3-shape
npm install -D @types/d3-sankey @types/d3-shape
```

**Step 2: Verify installation**

Run: `npm ls d3-sankey`
Expected: `d3-sankey@x.x.x` listed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add d3-sankey and d3-shape dependencies"
```

---

### Task 2: Add DB query for Sankey data

**Files:**
- Modify: `src/lib/db/reports.ts` (add new function + export interface)
- Test: `src/__tests__/lib/db/reports.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/lib/db/reports.test.ts`:

```typescript
describe('getSankeyData', () => {
  it('returns spending grouped by category_group and category', () => {
    const result = getSankeyData(db, {})
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('category')
    expect(result[0]).toHaveProperty('category_group')
    expect(result[0]).toHaveProperty('amount')
  })

  it('only includes debit transactions', () => {
    const result = getSankeyData(db, {})
    // All amounts should come from debit transactions only
    const totalFromSankey = result.reduce((sum, r) => sum + r.amount, 0)
    const summary = getSpendingSummary(db, {})
    expect(totalFromSankey).toBeCloseTo(summary.totalSpent, 2)
  })

  it('respects date filters', () => {
    const all = getSankeyData(db, {})
    const filtered = getSankeyData(db, { start_date: '2025-01-01', end_date: '2025-01-31' })
    expect(filtered.length).toBeLessThanOrEqual(all.length)
  })
})
```

Also add `getSankeyData` to the import at the top of the test file.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: FAIL — `getSankeyData` is not exported

**Step 3: Write the implementation**

Add to `src/lib/db/reports.ts`:

```typescript
export interface SankeyRow {
  category: string
  category_group: string
  color: string
  amount: number
}

export function getSankeyData(db: Database.Database, filters: ReportFilters): SankeyRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  return db.prepare(`
    SELECT
      COALESCE(c.name, 'Uncategorized') as category,
      COALESCE(c.category_group, 'Other') as category_group,
      COALESCE(c.color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    ${where}
    GROUP BY t.category_id
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(params) as SankeyRow[]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/reports.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/db/reports.ts" "src/__tests__/lib/db/reports.test.ts"
git commit -m "feat: add getSankeyData DB query for sankey diagram"
```

---

### Task 3: Add Sankey data to API response

**Files:**
- Modify: `src/app/api/reports/route.ts`

**Step 1: Read the current API route**

Read `src/app/api/reports/route.ts` to understand the current response structure.

**Step 2: Add sankeyData to the response**

Import `getSankeyData` and add it to the response object:

```typescript
import { getSankeyData } from '@/lib/db/reports'

// Inside the GET handler, after existing queries:
const sankeyData = getSankeyData(db, filters)

// Add to response:
return NextResponse.json({
  summary,
  spendingOverTime,
  categoryBreakdown,
  trend,
  topTransactions,
  sankeyData,
})
```

**Step 3: Verify manually**

Run: `npm run dev` and visit `http://localhost:3000/api/reports` in browser.
Expected: JSON response includes `sankeyData` array with `category`, `category_group`, `color`, `amount` fields.

**Step 4: Commit**

```bash
git add "src/app/api/reports/route.ts"
git commit -m "feat: include sankeyData in reports API response"
```

---

### Task 4: Build the Sankey diagram component

**Files:**
- Create: `src/components/reports/sankey-chart.tsx`

**Step 1: Create the Sankey component**

Create `src/components/reports/sankey-chart.tsx`:

```typescript
'use client'

import { useMemo, useState } from 'react'
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey'
import { useTheme } from 'next-themes'

interface SankeyRow {
  category: string
  category_group: string
  color: string
  amount: number
}

interface Props {
  data: SankeyRow[]
  totalIncome: number
}

interface NodeExtra {
  name: string
  color: string
}

type SNode = SankeyNode<NodeExtra, object>
type SLink = SankeyLink<NodeExtra, object>

const WIDTH = 700
const HEIGHT = 400
const MARGIN = { top: 10, right: 120, bottom: 10, left: 80 }

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function SankeyChart({ data, totalIncome }: Props) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [hoveredLink, setHoveredLink] = useState<number | null>(null)

  const { nodes, links } = useMemo(() => {
    if (!data.length) return { nodes: [] as SNode[], links: [] as SLink[] }

    // Build unique groups and categories
    const groups = [...new Set(data.map(d => d.category_group))]
    const categories = data.map(d => d.category)

    // Node indices: 0 = Income, 1..G = groups, G+1..G+C = categories
    const nodeList: NodeExtra[] = [
      { name: 'Income', color: isDark ? '#34D399' : '#10B981' },
      ...groups.map(g => ({ name: g, color: isDark ? '#A1A1AA' : '#737373' })),
      ...data.map(d => ({ name: d.category, color: d.color })),
    ]

    const groupIndex = (g: string) => 1 + groups.indexOf(g)
    const catIndex = (c: string) => 1 + groups.length + categories.indexOf(c)

    // Links: Income → each group (sum of group's categories)
    const groupTotals = new Map<string, number>()
    for (const d of data) {
      groupTotals.set(d.category_group, (groupTotals.get(d.category_group) ?? 0) + d.amount)
    }

    const linkList: Array<{ source: number; target: number; value: number }> = []

    for (const [group, total] of groupTotals) {
      linkList.push({ source: 0, target: groupIndex(group), value: total })
    }

    // Links: each group → its categories
    for (const d of data) {
      linkList.push({ source: groupIndex(d.category_group), target: catIndex(d.category), value: d.amount })
    }

    const layout = sankey<NodeExtra, object>()
      .nodeId((d: SNode) => (d as SNode & { index: number }).index)
      .nodeWidth(12)
      .nodePadding(4)
      .nodeSort(null)
      .extent([
        [MARGIN.left, MARGIN.top],
        [WIDTH - MARGIN.right, HEIGHT - MARGIN.bottom],
      ])

    const graph = layout({
      nodes: nodeList.map((n, i) => ({ ...n, index: i })),
      links: linkList.map(l => ({ ...l })),
    })

    return { nodes: graph.nodes, links: graph.links }
  }, [data, isDark])

  if (!data.length) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Money Flow</h3>
        <p className="text-xs text-muted-foreground py-8 text-center">No data available</p>
      </div>
    )
  }

  const textColor = isDark ? '#A1A1AA' : '#737373'

  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-2">Money Flow</h3>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ maxHeight: 400 }}>
        {/* Links */}
        {links.map((link, i) => {
          const path = sankeyLinkHorizontal()(link as any)
          if (!path) return null
          const sourceNode = link.source as SNode
          const opacity = hoveredLink === null ? 0.3 : hoveredLink === i ? 0.6 : 0.1
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={sourceNode.color}
              strokeWidth={Math.max(1, (link as any).width)}
              strokeOpacity={opacity}
              onMouseEnter={() => setHoveredLink(i)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{ transition: 'stroke-opacity 0.2s' }}
            >
              <title>
                {sourceNode.name} → {(link.target as SNode).name}: {formatAmount(link.value as number)}
              </title>
            </path>
          )
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const height = y1 - y0
          if (height < 1) return null

          const isLeft = x0 < WIDTH / 3
          const isRight = x0 > (WIDTH * 2) / 3

          return (
            <g key={i}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={height}
                fill={node.color}
                rx={1}
              >
                <title>{node.name}: {formatAmount(node.value as number)}</title>
              </rect>
              {/* Labels */}
              {height > 8 && (
                <text
                  x={isRight ? x1 + 6 : isLeft ? x0 - 6 : x0 - 6}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={isRight ? 'start' : 'end'}
                  fill={textColor}
                  fontSize={10}
                  fontFamily="system-ui"
                >
                  {node.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add "src/components/reports/sankey-chart.tsx"
git commit -m "feat: add Sankey diagram component with d3-sankey"
```

---

### Task 5: Integrate Sankey into Reports page

**Files:**
- Modify: `src/app/(app)/reports/page.tsx`

**Step 1: Add sankeyData to the ReportData interface**

In `src/app/(app)/reports/page.tsx`, add to the `ReportData` interface:

```typescript
sankeyData: Array<{ category: string; category_group: string; color: string; amount: number }>
```

**Step 2: Import and render the SankeyChart**

Add import:
```typescript
import { SankeyChart } from '@/components/reports/sankey-chart'
```

Add the chart below the existing 2-column grid (after the `</div>` that closes `grid-cols-2`) and before `<SpendingTrendChart>`:

```tsx
<SankeyChart data={data.sankeyData} totalIncome={data.summary.totalIncome} />
```

**Step 3: Verify visually**

Run: `npm run dev` and navigate to `/reports`.
Expected: Sankey diagram appears between the bar/pie charts and the trend chart. Income node on left, category groups in middle, individual categories on right. Hovering a link highlights it and shows a tooltip.

**Step 4: Commit**

```bash
git add "src/app/(app)/reports/page.tsx"
git commit -m "feat: integrate Sankey diagram into Reports page"
```

---

### Task 6: Build verification and lint check

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Fix any issues found and commit**

If any lint/build issues, fix them and commit:
```bash
git commit -m "fix: resolve lint/build issues in sankey diagram"
```
