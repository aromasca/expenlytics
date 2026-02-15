# Financial Intelligence Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace heuristic insights with a fully LLM-powered financial intelligence hub on the `/insights` page.

**Architecture:** SQL compacts transaction data into ~3-5KB JSON → two Haiku calls produce health score + patterns + deep insights → React renders structured output. Existing insight cache layer reused.

**Tech Stack:** better-sqlite3 (data compaction), Anthropic SDK + Haiku 4.5 (analysis), Zod (output validation), Recharts (income/outflow chart), React/shadcn (UI)

---

### Task 1: New Types & Zod Schemas

**Files:**
- Modify: `src/lib/insights/types.ts`
- Modify: `src/lib/claude/schemas.ts`

**Step 1: Update types.ts with new interfaces**

Replace the entire file:

```typescript
// src/lib/insights/types.ts
export type InsightSeverity = 'concerning' | 'notable' | 'favorable' | 'informational'

export interface HealthMetric {
  label: string
  value: string
  trend: 'up' | 'down' | 'stable'
  sentiment: 'good' | 'neutral' | 'bad'
}

export interface HealthAssessment {
  score: number
  summary: string
  color: 'green' | 'yellow' | 'red'
  metrics: HealthMetric[]
}

export interface PatternCard {
  id: string
  headline: string
  metric: string
  explanation: string
  category: 'timing' | 'merchant' | 'behavioral' | 'subscription' | 'correlation'
  severity: InsightSeverity
  evidence: {
    merchants?: string[]
    categories?: string[]
    time_period?: string
  }
}

export interface DeepInsight {
  id: string
  headline: string
  severity: InsightSeverity
  key_metric: string
  explanation: string
  action_suggestion?: string
  evidence: {
    category_a?: string
    category_b?: string
    merchant_names?: string[]
  }
}

export interface MonthlyFlow {
  month: string
  income: number
  spending: number
  net: number
}

export interface InsightsResponse {
  health: HealthAssessment | null
  monthlyFlow: MonthlyFlow[]
  patterns: PatternCard[]
  insights: DeepInsight[]
  dismissedCount: number
  generatedAt: string
}
```

**Step 2: Add Zod schemas to schemas.ts**

Append to `src/lib/claude/schemas.ts`:

```typescript
export const healthAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  color: z.enum(['green', 'yellow', 'red']),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down', 'stable']),
    sentiment: z.enum(['good', 'neutral', 'bad']),
  })),
})

export const patternCardSchema = z.object({
  id: z.string(),
  headline: z.string(),
  metric: z.string(),
  explanation: z.string(),
  category: z.enum(['timing', 'merchant', 'behavioral', 'subscription', 'correlation']),
  severity: z.enum(['concerning', 'notable', 'favorable', 'informational']),
  evidence: z.object({
    merchants: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    time_period: z.string().optional(),
  }),
})

export const healthAndPatternsSchema = z.object({
  health: healthAssessmentSchema,
  patterns: z.array(patternCardSchema),
})

export const deepInsightSchema = z.object({
  insights: z.array(z.object({
    headline: z.string(),
    severity: z.enum(['concerning', 'notable', 'favorable', 'informational']),
    key_metric: z.string(),
    explanation: z.string(),
    action_suggestion: z.string().optional(),
    evidence: z.object({
      category_a: z.string().optional(),
      category_b: z.string().optional(),
      merchant_names: z.array(z.string()).optional(),
    }),
  })),
})

export type HealthAndPatternsResult = z.infer<typeof healthAndPatternsSchema>
export type DeepInsightResult = z.infer<typeof deepInsightSchema>
```

**Step 3: Commit**

```bash
git add src/lib/insights/types.ts src/lib/claude/schemas.ts
git commit -m "feat: add types and Zod schemas for financial intelligence"
```

---

### Task 2: Data Compaction Layer

**Files:**
- Create: `src/lib/insights/compact-data.ts`
- Create: `src/__tests__/lib/insights/compact-data.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/lib/insights/compact-data.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { buildCompactData } from '@/lib/insights/compact-data'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }
  return row.id
}

function insertTx(db: Database.Database, opts: {
  date: string; description: string; amount: number;
  type?: string; category?: string; normalized_merchant?: string
}) {
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId, opts.normalized_merchant ?? null)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('buildCompactData', () => {
  it('returns empty structure for no transactions', () => {
    const db = createDb()
    const data = buildCompactData(db)
    expect(data.monthly).toEqual([])
    expect(data.categories).toEqual([])
    expect(data.merchants).toEqual([])
    expect(data.day_of_week).toHaveLength(7)
    expect(data.daily_recent).toEqual([])
    expect(data.recurring).toEqual([])
    expect(data.outliers).toEqual([])
  })

  it('compacts monthly income and spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.monthly.length).toBeGreaterThanOrEqual(1)
    const m = data.monthly.find(r => r.income > 0)
    expect(m).toBeDefined()
    expect(m!.income).toBe(5000)
    expect(m!.spending).toBe(200)
    expect(m!.net).toBe(4800)
  })

  it('includes merchant profiles with frequency data', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(3), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    const data = buildCompactData(db)
    const netflix = data.merchants.find(m => m.name === 'Netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.count).toBe(3)
    expect(netflix!.total).toBe(45)
  })

  it('includes day-of-week distribution', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Test', amount: 100, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.day_of_week).toHaveLength(7)
    const totalTxns = data.day_of_week.reduce((s, d) => s + d.transaction_count, 0)
    expect(totalTxns).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: FAIL — `buildCompactData` not found

**Step 3: Write the implementation**

```typescript
// src/lib/insights/compact-data.ts
import type Database from 'better-sqlite3'

export interface CompactFinancialData {
  monthly: Array<{ month: string; income: number; spending: number; net: number }>
  categories: Array<{ category: string; amounts: Record<string, number> }>
  merchants: Array<{
    name: string; total: number; count: number;
    avg: number; last_seen: string; first_seen: string;
    months_active: number
  }>
  day_of_week: Array<{ day: string; avg_spend: number; transaction_count: number }>
  daily_recent: Array<{ date: string; amount: number; is_income_day: boolean }>
  recurring: Array<{ merchant: string; amount: number; frequency: string; months: number }>
  outliers: Array<{ date: string; description: string; amount: number; category: string }>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function buildCompactData(db: Database.Database): CompactFinancialData {
  // Monthly income vs spending (last 12 months)
  const monthlyRows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date >= date('now', '-12 months')
      AND COALESCE(c.name, '') NOT IN ('Transfer', 'Refund')
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{ month: string; income: number; spending: number }>

  const monthly = monthlyRows.map(r => ({
    month: r.month,
    income: Math.round(r.income * 100) / 100,
    spending: Math.round(r.spending * 100) / 100,
    net: Math.round((r.income - r.spending) * 100) / 100,
  }))

  // Category spending by month (last 6 months, top 15 categories by total)
  const catRows = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category,
           strftime('%Y-%m', t.date) as month,
           SUM(t.amount) as amount
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    GROUP BY category, month
    ORDER BY amount DESC
  `).all() as Array<{ category: string; month: string; amount: number }>

  const catMap = new Map<string, Record<string, number>>()
  const catTotals = new Map<string, number>()
  for (const r of catRows) {
    if (!catMap.has(r.category)) catMap.set(r.category, {})
    catMap.get(r.category)![r.month] = Math.round(r.amount * 100) / 100
    catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount)
  }
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([cat]) => cat)
  const categories = topCats.map(cat => ({ category: cat, amounts: catMap.get(cat)! }))

  // Merchant profiles (top 30 by frequency + spend)
  const merchants = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as name,
           SUM(t.amount) as total,
           COUNT(*) as count,
           ROUND(AVG(t.amount), 2) as avg,
           MAX(t.date) as last_seen,
           MIN(t.date) as first_seen,
           COUNT(DISTINCT strftime('%Y-%m', t.date)) as months_active
    FROM transactions t
    WHERE t.type = 'debit' AND t.date >= date('now', '-12 months')
    GROUP BY name
    ORDER BY count DESC, total DESC
    LIMIT 30
  `).all() as CompactFinancialData['merchants']

  // Day-of-week distribution (last 6 months)
  const dowRows = db.prepare(`
    SELECT CAST(strftime('%w', t.date) AS INTEGER) as dow,
           ROUND(AVG(daily_total), 2) as avg_spend,
           SUM(daily_count) as transaction_count
    FROM (
      SELECT t.date,
             strftime('%w', t.date) as dow_inner,
             SUM(t.amount) as daily_total,
             COUNT(*) as daily_count
      FROM transactions t
      WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
      GROUP BY t.date
    ) t
    GROUP BY dow
    ORDER BY dow
  `).all() as Array<{ dow: number; avg_spend: number; transaction_count: number }>

  const dowMap = new Map(dowRows.map(r => [r.dow, r]))
  const day_of_week = DAY_NAMES.map((day, i) => ({
    day,
    avg_spend: dowMap.get(i)?.avg_spend ?? 0,
    transaction_count: dowMap.get(i)?.transaction_count ?? 0,
  }))

  // Daily spending for last 60 days with income day flag
  const incomeDates = new Set(
    (db.prepare(`
      SELECT DISTINCT date FROM transactions
      WHERE type = 'credit' AND date >= date('now', '-60 days')
        AND category_id IN (SELECT id FROM categories WHERE name IN ('Salary & Wages', 'Freelance Income'))
    `).all() as Array<{ date: string }>).map(r => r.date)
  )

  const dailyRows = db.prepare(`
    SELECT date, SUM(amount) as amount
    FROM transactions
    WHERE type = 'debit' AND date >= date('now', '-60 days')
    GROUP BY date
    ORDER BY date ASC
  `).all() as Array<{ date: string; amount: number }>

  const daily_recent = dailyRows.map(r => ({
    date: r.date,
    amount: Math.round(r.amount * 100) / 100,
    is_income_day: incomeDates.has(r.date),
  }))

  // Recurring charges (merchants with 2+ charges, consistent amounts)
  const recurringRows = db.prepare(`
    SELECT COALESCE(t.normalized_merchant, t.description) as merchant,
           ROUND(AVG(t.amount), 2) as amount,
           COUNT(*) as occurrences,
           COUNT(DISTINCT strftime('%Y-%m', t.date)) as months,
           MIN(t.date) as first_date,
           MAX(t.date) as last_date
    FROM transactions t
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-12 months')
      AND t.normalized_merchant IS NOT NULL
    GROUP BY merchant
    HAVING occurrences >= 2
      AND (MAX(t.amount) - MIN(t.amount)) / AVG(t.amount) < 0.3
    ORDER BY amount DESC
  `).all() as Array<{ merchant: string; amount: number; occurrences: number; months: number; first_date: string; last_date: string }>

  const recurring = recurringRows.map(r => {
    const spanDays = (new Date(r.last_date).getTime() - new Date(r.first_date).getTime()) / (1000 * 60 * 60 * 24)
    const avgDays = r.occurrences > 1 ? spanDays / (r.occurrences - 1) : 0
    let frequency = 'irregular'
    if (avgDays <= 10) frequency = 'weekly'
    else if (avgDays <= 45) frequency = 'monthly'
    else if (avgDays <= 120) frequency = 'quarterly'
    else if (avgDays <= 400) frequency = 'yearly'
    return { merchant: r.merchant, amount: r.amount, frequency, months: r.months }
  })

  // Outlier transactions (last 3 months, >2x category average)
  const outliers = db.prepare(`
    SELECT t.date, t.description, t.amount,
           COALESCE(c.name, 'Uncategorized') as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    JOIN (
      SELECT category_id, AVG(amount) as avg_amount
      FROM transactions
      WHERE type = 'debit' AND date >= date('now', '-6 months')
      GROUP BY category_id
    ) cat_avg ON t.category_id = cat_avg.category_id
    WHERE t.type = 'debit'
      AND t.date >= date('now', '-3 months')
      AND t.amount > cat_avg.avg_amount * 2
    ORDER BY t.amount DESC
    LIMIT 10
  `).all() as Array<{ date: string; description: string; amount: number; category: string }>

  return { monthly, categories, merchants, day_of_week, daily_recent, recurring, outliers }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/insights/compact-data.ts src/__tests__/lib/insights/compact-data.test.ts
git commit -m "feat: data compaction layer for LLM financial analysis"
```

---

### Task 3: Income vs Outflow DB Query

**Files:**
- Create: `src/lib/db/health.ts`
- Create: `src/__tests__/lib/db/health.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/lib/db/health.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }
  return row.id
}

function insertTx(db: Database.Database, opts: {
  date: string; description: string; amount: number;
  type?: string; category?: string
}) {
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('getMonthlyIncomeVsSpending', () => {
  it('returns empty for no data', () => {
    const db = createDb()
    expect(getMonthlyIncomeVsSpending(db)).toEqual([])
  })

  it('computes monthly income and spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Rent', amount: 1500, category: 'Rent & Mortgage' })
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 300, category: 'Groceries' })
    const result = getMonthlyIncomeVsSpending(db)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const month = result.find(r => r.income > 0)
    expect(month).toBeDefined()
    expect(month!.income).toBe(5000)
    expect(month!.spending).toBe(1800)
  })

  it('excludes Transfer and Refund from income', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Transfer', amount: 1000, type: 'credit', category: 'Transfer' })
    insertTx(db, { date: monthsAgo(1), description: 'Refund', amount: 50, type: 'credit', category: 'Refund' })
    const result = getMonthlyIncomeVsSpending(db)
    const month = result.find(r => r.income > 0)
    expect(month!.income).toBe(5000)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/health.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/lib/db/health.ts
import type Database from 'better-sqlite3'
import type { MonthlyFlow } from '@/lib/insights/types'

export function getMonthlyIncomeVsSpending(db: Database.Database): MonthlyFlow[] {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' AND COALESCE(c.name, '') NOT IN ('Transfer', 'Refund')
               THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.date >= date('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{ month: string; income: number; spending: number }>

  return rows.map(r => ({
    month: r.month,
    income: Math.round(r.income * 100) / 100,
    spending: Math.round(r.spending * 100) / 100,
    net: Math.round((r.income - r.spending) * 100) / 100,
  }))
}
```

**Step 4: Run tests**

Run: `npm test -- src/__tests__/lib/db/health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/health.ts src/__tests__/lib/db/health.test.ts
git commit -m "feat: monthly income vs spending query"
```

---

### Task 4: LLM Analysis — Health Score + Patterns

**Files:**
- Create: `src/lib/claude/analyze-finances.ts`
- Create: `src/__tests__/lib/claude/analyze-finances.test.ts`

**Step 1: Write the test**

```typescript
// src/__tests__/lib/claude/analyze-finances.test.ts
import { describe, it, expect, vi } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  }
}))

import { analyzeHealthAndPatterns, analyzeDeepInsights } from '@/lib/claude/analyze-finances'
import type { CompactFinancialData } from '@/lib/insights/compact-data'

const SAMPLE_DATA: CompactFinancialData = {
  monthly: [
    { month: '2026-01', income: 5000, spending: 3500, net: 1500 },
    { month: '2025-12', income: 5000, spending: 3200, net: 1800 },
  ],
  categories: [{ category: 'Groceries', amounts: { '2026-01': 400, '2025-12': 350 } }],
  merchants: [{ name: 'Whole Foods', total: 750, count: 8, avg: 93.75, last_seen: '2026-01-28', first_seen: '2025-08-15', months_active: 6 }],
  day_of_week: [
    { day: 'Sunday', avg_spend: 50, transaction_count: 10 },
    { day: 'Monday', avg_spend: 80, transaction_count: 15 },
    { day: 'Tuesday', avg_spend: 70, transaction_count: 12 },
    { day: 'Wednesday', avg_spend: 75, transaction_count: 14 },
    { day: 'Thursday', avg_spend: 85, transaction_count: 16 },
    { day: 'Friday', avg_spend: 120, transaction_count: 20 },
    { day: 'Saturday', avg_spend: 90, transaction_count: 18 },
  ],
  daily_recent: [{ date: '2026-01-15', amount: 150, is_income_day: true }],
  recurring: [{ merchant: 'Netflix', amount: 15.99, frequency: 'monthly', months: 6 }],
  outliers: [],
}

describe('analyzeHealthAndPatterns', () => {
  it('parses LLM response into health assessment and patterns', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          health: {
            score: 72,
            summary: 'Solid finances with room to improve savings',
            color: 'green',
            metrics: [
              { label: 'Savings Rate', value: '30%', trend: 'down', sentiment: 'good' },
              { label: 'Monthly Burn', value: '$3,500', trend: 'up', sentiment: 'neutral' },
            ],
          },
          patterns: [{
            id: 'friday-spending',
            headline: 'Friday Spending Spike',
            metric: '$120 avg on Fridays vs $75 other days',
            explanation: 'Your Friday spending is 60% higher than your weekday average.',
            category: 'timing',
            severity: 'notable',
            evidence: { time_period: 'Fridays' },
          }],
        }),
      }],
    })

    const result = await analyzeHealthAndPatterns(SAMPLE_DATA)
    expect(result.health.score).toBe(72)
    expect(result.health.metrics.length).toBeGreaterThanOrEqual(1)
    expect(result.patterns.length).toBeGreaterThanOrEqual(1)
    expect(result.patterns[0].headline).toBe('Friday Spending Spike')
  })
})

describe('analyzeDeepInsights', () => {
  it('parses LLM response into deep insights', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          insights: [{
            headline: 'Grocery spending is steady',
            severity: 'favorable',
            key_metric: '$400/mo',
            explanation: 'Your grocery spending has been consistent.',
            evidence: { category_a: 'Groceries' },
          }],
        }),
      }],
    })

    const result = await analyzeDeepInsights(SAMPLE_DATA, { score: 72, summary: 'Good', color: 'green' as const, metrics: [] })
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].headline).toBe('Grocery spending is steady')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/claude/analyze-finances.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// src/lib/claude/analyze-finances.ts
import Anthropic from '@anthropic-ai/sdk'
import { healthAndPatternsSchema, deepInsightSchema, type HealthAndPatternsResult, type DeepInsightResult } from './schemas'
import type { CompactFinancialData } from '@/lib/insights/compact-data'
import type { HealthAssessment, DeepInsight } from '@/lib/insights/types'

const HEALTH_AND_PATTERNS_SYSTEM = `You are an expert financial analyst. Given compact transaction data, produce two things:

1. A HEALTH ASSESSMENT: Score 0-100, one-line summary, color (green ≥70, yellow 40-69, red <40), and 4-5 key metrics (savings rate, monthly burn, subscription burden, etc.)

2. BEHAVIORAL PATTERNS: 6-8 specific, surprising observations about spending behavior. Each must have a concrete metric. Look for:
   - Temporal patterns: payday spending spikes, weekend vs weekday, day-of-week patterns
   - Merchant patterns: loyalty concentration, dormant subscriptions, price creep
   - Cross-category correlations: e.g., groceries down + delivery up = eating out more
   - Spending velocity: front-loading vs back-loading within months
   - Unusual recent behavior vs historical baseline

Be specific with numbers. "Fridays cost $120/day vs $75 average" is better than "you spend more on Fridays."
Don't repeat obvious facts. Find what's surprising or actionable.`

const HEALTH_AND_PATTERNS_USER = `Here is the compact financial data. Analyze it and return JSON.

{data_json}

Return ONLY valid JSON in this exact format:
{
  "health": {
    "score": 0-100,
    "summary": "one line",
    "color": "green|yellow|red",
    "metrics": [{"label": "...", "value": "...", "trend": "up|down|stable", "sentiment": "good|neutral|bad"}]
  },
  "patterns": [
    {
      "id": "unique-slug",
      "headline": "Short title",
      "metric": "The key number",
      "explanation": "2-3 sentences",
      "category": "timing|merchant|behavioral|subscription|correlation",
      "severity": "concerning|notable|favorable|informational",
      "evidence": {"merchants": [], "categories": [], "time_period": ""}
    }
  ]
}`

const DEEP_INSIGHTS_SYSTEM = `You are an expert financial advisor reviewing someone's spending data. Your health assessment scored them {score}/100: "{summary}"

Now produce 8-12 deep, narrative insights. Each should be genuinely surprising and actionable — the kind of observation that makes someone say "I had no idea."

Quality criteria:
- Cross-correlations between spending categories
- Merchant-level intelligence (unused subscriptions, loyalty patterns)
- Behavioral observations grounded in timing data
- Actionable recommendations tied to specific dollar amounts
- Positive trends worth reinforcing

Do NOT repeat the health assessment or pattern observations. Go deeper.`

const DEEP_INSIGHTS_USER = `Here is the compact financial data:

{data_json}

Return ONLY valid JSON:
{
  "insights": [
    {
      "headline": "Short attention-grabbing title",
      "severity": "concerning|notable|favorable|informational",
      "key_metric": "The key number",
      "explanation": "2-3 sentences",
      "action_suggestion": "One concrete action (optional)",
      "evidence": {
        "category_a": "primary category (optional)",
        "category_b": "secondary category (optional)",
        "merchant_names": ["merchant1"]
      }
    }
  ]
}`

function stripCodeFences(text: string): string {
  return text.trim().replace(/^`{3,}(?:json)?\s*\n?/, '').replace(/\n?`{3,}\s*$/, '')
}

export async function analyzeHealthAndPatterns(data: CompactFinancialData): Promise<HealthAndPatternsResult> {
  const client = new Anthropic()
  const prompt = HEALTH_AND_PATTERNS_USER.replace('{data_json}', JSON.stringify(data))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: HEALTH_AND_PATTERNS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const parsed = JSON.parse(stripCodeFences(textBlock.text))
  return healthAndPatternsSchema.parse(parsed)
}

export async function analyzeDeepInsights(
  data: CompactFinancialData,
  health: HealthAssessment
): Promise<DeepInsight[]> {
  const client = new Anthropic()
  const system = DEEP_INSIGHTS_SYSTEM
    .replace('{score}', String(health.score))
    .replace('{summary}', health.summary)
  const prompt = DEEP_INSIGHTS_USER.replace('{data_json}', JSON.stringify(data))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const parsed = JSON.parse(stripCodeFences(textBlock.text))
  const result = deepInsightSchema.parse(parsed)

  return result.insights.map((insight, i) => ({
    id: `llm-insight-${i}`,
    ...insight,
  }))
}
```

**Step 4: Run tests**

Run: `npm test -- src/__tests__/lib/claude/analyze-finances.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/claude/analyze-finances.ts src/__tests__/lib/claude/analyze-finances.test.ts
git commit -m "feat: LLM analysis for health score, patterns, and deep insights"
```

---

### Task 5: API Route

**Files:**
- Modify: `src/app/api/insights/route.ts`
- Create: `src/__tests__/api/insights.test.ts` (optional — API routes are hard to unit test in Next.js; lean on integration)

**Step 1: Rewrite the API route**

Replace `src/app/api/insights/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { buildCompactData } from '@/lib/insights/compact-data'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'
import { analyzeHealthAndPatterns, analyzeDeepInsights } from '@/lib/claude/analyze-finances'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import type { InsightsResponse, HealthAssessment, PatternCard, DeepInsight } from '@/lib/insights/types'

export async function GET(request: NextRequest) {
  try {
    const db = getDb()

    const refresh = request.nextUrl.searchParams.get('refresh')
    if (refresh === 'true') {
      clearInsightCache(db)
    }

    // Always compute chart data (fast SQL query, no LLM)
    const monthlyFlow = getMonthlyIncomeVsSpending(db)

    // Check cache
    const cacheKey = generateCacheKey(db)
    const cached = getCachedInsights(db, cacheKey)

    let health: HealthAssessment | null = null
    let patterns: PatternCard[] = []
    let insights: DeepInsight[] = []

    if (cached) {
      // Cache stores { health, patterns, insights }
      const cachedData = cached as unknown as { health: HealthAssessment; patterns: PatternCard[]; insights: DeepInsight[] }
      health = cachedData.health
      patterns = cachedData.patterns
      insights = cachedData.insights
    } else {
      // Build compact data and run LLM analysis
      const compactData = buildCompactData(db)

      // Only run LLM if we have enough data
      const totalTxns = compactData.monthly.reduce((s, m) => s + m.spending, 0)
      if (totalTxns > 0) {
        try {
          const healthAndPatterns = await analyzeHealthAndPatterns(compactData)
          health = healthAndPatterns.health
          patterns = healthAndPatterns.patterns
        } catch (error) {
          console.error('Health/patterns analysis failed:', error)
        }

        if (health) {
          try {
            insights = await analyzeDeepInsights(compactData, health)
          } catch (error) {
            console.error('Deep insights analysis failed:', error)
          }
        }

        // Cache all results together
        if (health || patterns.length > 0 || insights.length > 0) {
          setCachedInsights(db, cacheKey, { health, patterns, insights } as unknown as import('@/lib/insights/types').InsightCard[])
        }
      }
    }

    // Filter dismissed insights
    const dismissedIds = new Set(getDismissedInsightIds(db))
    const filteredInsights = insights.filter(i => !dismissedIds.has(i.id))
    const dismissedCount = insights.length - filteredInsights.length

    const response: InsightsResponse = {
      health,
      monthlyFlow,
      patterns,
      insights: filteredInsights,
      dismissedCount,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
```

**Step 2: Verify build compiles**

Run: `npm run build`
Expected: May have type errors in the page component (expected — we fix that in Task 7)

**Step 3: Commit**

```bash
git add src/app/api/insights/route.ts
git commit -m "feat: rewrite insights API with LLM-powered analysis"
```

---

### Task 6: UI Components — Health Score + Pattern Grid + Income Chart

**Files:**
- Create: `src/components/insights/health-score.tsx`
- Create: `src/components/insights/pattern-grid.tsx`
- Create: `src/components/insights/income-outflow-chart.tsx`

**Step 1: Health Score component**

```tsx
// src/components/insights/health-score.tsx
'use client'

import type { HealthAssessment } from '@/lib/insights/types'

const colorMap = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
}

const sentimentColor = {
  good: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-foreground',
  bad: 'text-red-600 dark:text-red-400',
}

const trendArrow = { up: '↑', down: '↓', stable: '→' }

export function HealthScore({ health }: { health: HealthAssessment }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <span className={`text-4xl font-semibold tabular-nums ${colorMap[health.color]}`}>
          {health.score}
        </span>
        <span className="text-sm text-muted-foreground">{health.summary}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {health.metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1">
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
            <span className={`text-sm tabular-nums ${sentimentColor[m.sentiment]}`}>
              {m.value}
            </span>
            <span className={`text-[11px] ${sentimentColor[m.sentiment]}`}>
              {trendArrow[m.trend]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Pattern Grid component**

```tsx
// src/components/insights/pattern-grid.tsx
'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import type { PatternCard } from '@/lib/insights/types'

const severityColor = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

export function PatternGrid({ patterns }: { patterns: PatternCard[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (patterns.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {patterns.map((p) => (
        <Card
          key={p.id}
          className={`p-3 border-l-2 ${severityColor[p.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
          onClick={() => setExpandedId(prev => prev === p.id ? null : p.id)}
        >
          <p className="text-xs font-medium leading-tight">{p.headline}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{p.metric}</p>
          {expandedId === p.id && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{p.explanation}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
```

**Step 3: Income Outflow Chart component**

```tsx
// src/components/insights/income-outflow-chart.tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { MonthlyFlow } from '@/lib/insights/types'

export function IncomeOutflowChart({ data }: { data: MonthlyFlow[] }) {
  if (data.length === 0) return null

  // Detect dark mode
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5)} // "01", "02", etc
          />
          <YAxis
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}K`}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: gridColor,
              fontSize: 12,
            }}
            labelStyle={{ color: textColor }}
            itemStyle={{ color: textColor }}
            formatter={(value: number | undefined) => [`$${Number(value).toLocaleString()}`, '']}
          />
          <Bar dataKey="income" fill="#10B981" radius={[2, 2, 0, 0]} name="Income" />
          <Bar dataKey="spending" fill={isDark ? '#FAFAFA' : '#0A0A0A'} radius={[2, 2, 0, 0]} name="Spending" />
          <ReferenceLine y={0} stroke={gridColor} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/components/insights/health-score.tsx src/components/insights/pattern-grid.tsx src/components/insights/income-outflow-chart.tsx
git commit -m "feat: UI components for health score, patterns, and income chart"
```

---

### Task 7: Rewrite Insights Page

**Files:**
- Modify: `src/app/(app)/insights/page.tsx`

**Step 1: Rewrite the page**

```tsx
// src/app/(app)/insights/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { HealthScore } from '@/components/insights/health-score'
import { IncomeOutflowChart } from '@/components/insights/income-outflow-chart'
import { PatternGrid } from '@/components/insights/pattern-grid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Receipt, BarChart3, CreditCard, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { InsightsResponse, DeepInsight } from '@/lib/insights/types'

const severityColor = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

function InsightCard({ insight, expanded, onToggle }: { insight: DeepInsight; expanded: boolean; onToggle: () => void }) {
  return (
    <Card
      className={`p-3 border-l-2 ${severityColor[insight.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
      onClick={onToggle}
    >
      <p className="text-xs font-medium leading-tight">{insight.headline}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{insight.key_metric}</p>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
          {insight.action_suggestion && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{insight.action_suggestion}</p>
          )}
        </div>
      )}
    </Card>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchInsights = (refresh = false) => {
    setLoading(true)
    fetch(`/api/insights${refresh ? '?refresh=true' : ''}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setCarouselIndex(0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchInsights() }, [])

  const handleDismiss = (insightId: string) => {
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightId }),
    })
      .then(() => {
        setData((prev) => {
          if (!prev) return prev
          const filtered = prev.insights.filter((i) => i.id !== insightId)
          return { ...prev, insights: filtered, dismissedCount: prev.dismissedCount + 1 }
        })
      })
      .catch(() => {})
  }

  const handleClearDismissals = () => {
    fetch('/api/insights/dismiss', { method: 'DELETE' })
      .then(() => fetchInsights())
      .catch(() => {})
  }

  const insights = data?.insights ?? []
  const pageSize = 3
  const pageCount = Math.max(1, Math.ceil(insights.length / pageSize))
  const page = Math.min(carouselIndex, pageCount - 1)
  const visibleInsights = insights.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Insights</h1>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => fetchInsights(true)}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !data?.health && insights.length === 0 && (data?.patterns ?? []).length === 0 && (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm font-medium">No insights yet</p>
          <p className="text-xs text-muted-foreground">Upload bank statements to see spending analysis.</p>
          <Link href="/transactions">
            <Button variant="outline" size="sm" className="mt-3">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Transactions
            </Button>
          </Link>
        </div>
      )}

      {data && (data.health || insights.length > 0 || (data.patterns ?? []).length > 0) && (
        <>
          {/* Section 1: Health Score */}
          {data.health && (
            <section>
              <HealthScore health={data.health} />
            </section>
          )}

          {/* Section 2: Income vs Outflow */}
          {data.monthlyFlow && data.monthlyFlow.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">Income vs Outflow</h2>
              <IncomeOutflowChart data={data.monthlyFlow} />
            </section>
          )}

          {/* Section 3: Patterns */}
          {data.patterns && data.patterns.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">Patterns</h2>
              <PatternGrid patterns={data.patterns} />
            </section>
          )}

          {/* Section 4: Deep Insights Carousel */}
          {insights.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">AI Insights</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 0} onClick={() => setCarouselIndex(i => i - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, insights.length)} / {insights.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pageCount - 1} onClick={() => setCarouselIndex(i => i + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  {(data.dismissedCount ?? 0) > 0 && (
                    <button onClick={handleClearDismissals} className="text-xs text-muted-foreground hover:text-foreground ml-2">
                      {data.dismissedCount} dismissed
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {visibleInsights.map((insight) => (
                  <div key={insight.id} className="relative group">
                    <button
                      onClick={() => handleDismiss(insight.id)}
                      className="absolute top-2 right-2 z-10 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <InsightCard
                      insight={insight}
                      expanded={expandedId === insight.id}
                      onToggle={() => setExpandedId(prev => prev === insight.id ? null : insight.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {insights.length === 0 && (data.dismissedCount ?? 0) > 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              All dismissed.{' '}
              <button onClick={handleClearDismissals} className="underline hover:text-foreground">Reset</button>
            </div>
          )}

          {/* Footer links */}
          <section className="pt-3 border-t flex flex-wrap items-center gap-2">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Reports
              </Button>
            </Link>
            <Link href="/transactions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 mr-1" /> Transactions
              </Button>
            </Link>
            <Link href="/subscriptions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5 mr-1" /> Recurring
              </Button>
            </Link>
            {data.generatedAt && (
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </section>
        </>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: PASS (or minor fixable errors)

**Step 3: Commit**

```bash
git add "src/app/(app)/insights/page.tsx"
git commit -m "feat: rewrite insights page with health score, patterns, income chart, and deep insights"
```

---

### Task 8: Clean Up Old Code

**Files:**
- Delete: `src/lib/insights/detection.ts`
- Delete: `src/lib/insights/ranking.ts`
- Delete: `src/lib/insights/data-summary.ts`
- Delete: `src/__tests__/lib/insights/detection.test.ts`
- Delete: `src/__tests__/lib/insights/ranking.test.ts`
- Delete: `src/__tests__/lib/insights/data-summary.test.ts`
- Delete: `src/__tests__/lib/insights/llm-detection.test.ts`
- Delete: `src/components/insights/insight-hero.tsx`
- Delete: `src/components/insights/insight-card.tsx`
- Delete: `src/components/insights/insight-grid.tsx`

**Step 1: Remove old files**

```bash
rm src/lib/insights/detection.ts src/lib/insights/ranking.ts src/lib/insights/data-summary.ts
rm src/__tests__/lib/insights/detection.test.ts src/__tests__/lib/insights/ranking.test.ts src/__tests__/lib/insights/data-summary.test.ts src/__tests__/lib/insights/llm-detection.test.ts
rm src/components/insights/insight-hero.tsx src/components/insights/insight-card.tsx src/components/insights/insight-grid.tsx
```

**Step 2: Check for stale imports**

Search all files for imports from deleted modules. Fix any references:
- `detection.ts` was imported by `src/app/api/insights/route.ts` (already rewritten)
- `ranking.ts` was imported by `detection.ts` (deleted)
- `data-summary.ts` was imported by `detection.ts` (deleted)
- `insight-card.tsx`, `insight-grid.tsx` were imported by the old insights page (already rewritten)

Run: `npm run build`
Expected: PASS

**Step 3: Run all tests**

Run: `npm test`
Expected: PASS (old tests deleted, new tests pass)

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove heuristic insight detectors replaced by LLM analysis"
```

---

### Task 9: Verify End-to-End

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Manual verification**

- Navigate to `/insights`
- If no transactions: should show empty state
- If transactions exist: should show health score, income chart, pattern cards, deep insights carousel
- Test refresh button
- Test dismiss/reset on insights
- Test expand/collapse on patterns and insights

**Step 3: Run full test suite**

Run: `npm test`
Expected: All pass

**Step 4: Production build check**

Run: `npm run build`
Expected: PASS
