# High-Signal Financial Insights Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace shallow, noisy LLM insights with 3-5 deeply analyzed, actionable insights by sending richer data (raw transactions + merchant trends) in a single Sonnet call with a rewritten prompt.

**Architecture:** Enrich `buildCompactData` with `recent_transactions` and `merchant_month_deltas`. Merge two LLM calls (`analyzeHealthAndPatterns` + `analyzeDeepInsights`) into one `analyzeFinances`. Rewrite prompt with examples and enforced insight types. Simplify UI to render unified insight cards.

**Tech Stack:** Next.js 16 App Router, better-sqlite3, Anthropic/OpenAI SDK, Zod, Recharts, Vitest

---

### Task 1: Add `recent_transactions` to compact data

**Files:**
- Modify: `src/lib/insights/compact-data.ts`
- Test: `src/__tests__/lib/insights/compact-data.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/lib/insights/compact-data.test.ts`:

```typescript
it('includes recent_transactions for last 90 days', () => {
  const db = createDb()
  // Transaction within 90 days — should be included
  insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 85.50, category: 'Groceries', normalized_merchant: 'Whole Foods' })
  // Transaction outside 90 days — should be excluded
  insertTx(db, { date: monthsAgo(4), description: 'Old Purchase', amount: 50, category: 'Groceries' })
  const data = buildCompactData(db)
  expect(data.recent_transactions).toBeDefined()
  expect(data.recent_transactions).toHaveLength(1)
  expect(data.recent_transactions[0]).toMatchObject({
    date: expect.any(String),
    description: 'Whole Foods',
    amount: 85.50,
    type: 'debit',
    category: 'Groceries',
    normalized_merchant: 'Whole Foods',
  })
})

it('excludes transfer/payment classes from recent_transactions', () => {
  const db = createDb()
  insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
  // Insert a payment-class transaction
  db.prepare(`
    INSERT INTO documents (filename, filepath, status, file_hash)
    VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-recent-txn-test')
  `).run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  const catId = getCategoryId(db, 'Groceries')
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
    VALUES (?, ?, 'CC Payment', 500, 'debit', ?, 'payment')
  `).run(docId, monthsAgo(1), catId)
  const data = buildCompactData(db)
  expect(data.recent_transactions).toHaveLength(1)
  expect(data.recent_transactions[0].description).toBe('Groceries')
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: FAIL — `recent_transactions` does not exist on `CompactFinancialData`

**Step 3: Implement recent_transactions**

In `src/lib/insights/compact-data.ts`:

1. Add to `CompactFinancialData` interface:
```typescript
recent_transactions: Array<{
  date: string; description: string; normalized_merchant: string | null;
  amount: number; type: string; category: string; transaction_class: string | null
}>
```

2. Add query after the existing `top_merchants_by_category` section (before the `return`):
```typescript
// Individual transactions for last 90 days (gives LLM specific purchase context)
const recent_transactions = db.prepare(`
  SELECT t.date, t.description,
         t.normalized_merchant,
         t.amount, t.type,
         COALESCE(c.name, 'Uncategorized') as category,
         t.transaction_class
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.date >= date('now', '-90 days')
    AND COALESCE(c.exclude_from_totals, 0) = 0
    AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
  ORDER BY t.date DESC
`).all() as CompactFinancialData['recent_transactions']
```

3. Add `recent_transactions` to the return object.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/insights/compact-data.ts src/__tests__/lib/insights/compact-data.test.ts
git commit -m "feat: add recent_transactions to compact financial data"
```

---

### Task 2: Add `merchant_month_deltas` to compact data

**Files:**
- Modify: `src/lib/insights/compact-data.ts`
- Test: `src/__tests__/lib/insights/compact-data.test.ts`

**Step 1: Write the failing test**

```typescript
it('includes merchant_month_deltas for top merchants', () => {
  const db = createDb()
  insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
  insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
  insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 200, normalized_merchant: 'Whole Foods', category: 'Groceries' })
  insertTx(db, { date: monthsAgo(2), description: 'Whole Foods', amount: 150, normalized_merchant: 'Whole Foods', category: 'Groceries' })
  const data = buildCompactData(db)
  expect(data.merchant_month_deltas).toBeDefined()
  expect(data.merchant_month_deltas.length).toBeGreaterThanOrEqual(2)
  const wf = data.merchant_month_deltas.find(m => m.merchant === 'Whole Foods')
  expect(wf).toBeDefined()
  expect(Object.keys(wf!.months).length).toBeGreaterThanOrEqual(2)
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: FAIL — `merchant_month_deltas` does not exist

**Step 3: Implement merchant_month_deltas**

In `src/lib/insights/compact-data.ts`:

1. Add to `CompactFinancialData` interface:
```typescript
merchant_month_deltas: Array<{ merchant: string; months: Record<string, number> }>
```

2. Add query (after `recent_transactions`, before `return`):
```typescript
// Month-by-month spending for top 20 merchants (lets LLM spot merchant trends)
const merchantMonthRows = db.prepare(`
  SELECT COALESCE(t.normalized_merchant, t.description) as merchant,
         strftime('%Y-%m', t.date) as month,
         SUM(t.amount) as total
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    AND COALESCE(c.exclude_from_totals, 0) = 0
    AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
  GROUP BY COALESCE(t.normalized_merchant, t.description), strftime('%Y-%m', t.date)
  ORDER BY total DESC
`).all() as Array<{ merchant: string; month: string; total: number }>

const deltaMap = new Map<string, Record<string, number>>()
const deltaTotals = new Map<string, number>()
for (const r of merchantMonthRows) {
  if (!deltaMap.has(r.merchant)) deltaMap.set(r.merchant, {})
  deltaMap.get(r.merchant)![r.month] = Math.round(r.total * 100) / 100
  deltaTotals.set(r.merchant, (deltaTotals.get(r.merchant) ?? 0) + r.total)
}
const merchant_month_deltas = [...deltaTotals.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([merchant]) => ({ merchant, months: deltaMap.get(merchant)! }))
```

3. Add `merchant_month_deltas` to the return object.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/insights/compact-data.ts src/__tests__/lib/insights/compact-data.test.ts
git commit -m "feat: add merchant_month_deltas to compact financial data"
```

---

### Task 3: Unified schema and types

**Files:**
- Modify: `src/lib/llm/schemas.ts`
- Modify: `src/lib/insights/types.ts`

**Step 1: Add new schema to `src/lib/llm/schemas.ts`**

Add after the existing `deepInsightSchema` (keep old schemas until Task 5 removes references):

```typescript
export const insightTypeSchema = z.string().transform((v): 'behavioral_shift' | 'money_leak' | 'projection' => {
  if (['behavioral_shift', 'behavior', 'shift', 'correlation'].includes(v)) return 'behavioral_shift'
  if (['money_leak', 'leak', 'waste', 'subscription'].includes(v)) return 'money_leak'
  if (['projection', 'trend', 'forecast', 'warning'].includes(v)) return 'projection'
  return 'behavioral_shift'
})

export const financialAnalysisSchema = z.object({
  health: healthAssessmentSchema,
  insights: z.array(z.object({
    type: insightTypeSchema,
    headline: z.string(),
    severity: severitySchema,
    explanation: z.string(),
    evidence: z.object({
      merchants: stringOrArraySchema,
      categories: stringOrArraySchema,
      amounts: z.record(z.string(), z.number()).optional(),
      time_period: z.string().optional(),
    }),
    action: z.string().optional(),
  })),
})

export type FinancialAnalysisResult = z.infer<typeof financialAnalysisSchema>
```

**Step 2: Add new types to `src/lib/insights/types.ts`**

```typescript
export type InsightType = 'behavioral_shift' | 'money_leak' | 'projection'

export interface Insight {
  id: string
  type: InsightType
  headline: string
  severity: InsightSeverity
  explanation: string
  evidence: {
    merchants?: string[]
    categories?: string[]
    amounts?: Record<string, number>
    time_period?: string
  }
  action?: string
}

export interface InsightsResponseV2 {
  status: 'ready' | 'generating'
  health: HealthAssessment | null
  monthlyFlow: MonthlyFlow[]
  insights: Insight[]
  dismissedCount: number
  generatedAt: string
}
```

Note: Keep the existing `InsightsResponse`, `PatternCard`, and `DeepInsight` types until Task 6 removes all references. Name the new response `InsightsResponseV2` temporarily — it gets renamed to `InsightsResponse` in Task 6 when old types are removed.

**Step 3: Run all tests to verify nothing breaks**

Run: `npm test`
Expected: All existing tests PASS (we only added new types, didn't change old ones)

**Step 4: Commit**

```bash
git add src/lib/llm/schemas.ts src/lib/insights/types.ts
git commit -m "feat: add unified financial analysis schema and Insight type"
```

---

### Task 4: Rewrite prompt and merge LLM calls

**Files:**
- Modify: `src/lib/llm/prompts/insights.ts`
- Modify: `src/lib/llm/analyze-finances.ts`
- Test: `src/__tests__/lib/llm/analyze-finances.test.ts`

**Step 1: Write the failing test**

Replace the contents of `src/__tests__/lib/llm/analyze-finances.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { analyzeFinances } from '@/lib/llm/analyze-finances'
import type { CompactFinancialData } from '@/lib/insights/compact-data'

function createMockProvider(responseText: string) {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider,
    mockComplete,
    mockExtract,
  }
}

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
  top_merchants_by_category: [],
  recent_transactions: [
    { date: '2026-01-15', description: 'Whole Foods Market', normalized_merchant: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries', transaction_class: 'purchase' },
  ],
  merchant_month_deltas: [
    { merchant: 'Whole Foods', months: { '2026-01': 400, '2025-12': 350 } },
  ],
}

describe('analyzeFinances', () => {
  it('makes a single LLM call and returns health + insights', async () => {
    const responseJSON = JSON.stringify({
      health: {
        score: 72,
        summary: 'Solid finances with room to improve savings',
        color: 'green',
        metrics: [
          { label: 'Savings Rate', value: '30%', trend: 'down', sentiment: 'good' },
        ],
      },
      insights: [{
        type: 'behavioral_shift',
        headline: 'Grocery-to-delivery shift',
        severity: 'concerning',
        explanation: 'Your grocery spending dropped while food delivery doubled.',
        evidence: { categories: ['Groceries', 'Food Delivery'], time_period: 'Jan vs Dec' },
        action: 'Try meal planning to reduce delivery reliance.',
      }],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeFinances(provider, 'anthropic', SAMPLE_DATA, 'claude-sonnet-4-5-20250929')

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(result.health.score).toBe(72)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0]).toMatchObject({
      id: 'llm-insight-0',
      type: 'behavioral_shift',
      headline: 'Grocery-to-delivery shift',
    })
  })

  it('includes recent_transactions context in prompt', async () => {
    const responseJSON = JSON.stringify({
      health: { score: 50, summary: 'OK', color: 'yellow', metrics: [] },
      insights: [],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    await analyzeFinances(provider, 'anthropic', SAMPLE_DATA, 'claude-sonnet-4-5-20250929')

    const userPrompt = mockComplete.mock.calls[0][0].messages[0].content as string
    expect(userPrompt).toContain('Whole Foods Market')
    expect(userPrompt).toContain('recent_transactions')
  })

  it('works with openai provider name', async () => {
    const responseJSON = JSON.stringify({
      health: { score: 60, summary: 'Fair', color: 'yellow', metrics: [] },
      insights: [],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeFinances(provider, 'openai', SAMPLE_DATA, 'gpt-5')

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(result.health.score).toBe(60)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/llm/analyze-finances.test.ts`
Expected: FAIL — `analyzeFinances` does not exist

**Step 3: Rewrite the prompt**

Replace `src/lib/llm/prompts/insights.ts` entirely. The new file has a single `FINANCIAL_ANALYSIS_PROMPTS` record (replacing `HEALTH_AND_PATTERNS_PROMPTS` and `DEEP_INSIGHTS_PROMPTS`), exported via `getFinancialAnalysisPrompt(provider)`.

**Anthropic system prompt** (XML-style):

```
You're reviewing a close friend's finances. Tell them the 3-5 things they genuinely need to hear — things they'd miss looking at their own numbers.

You will receive:
- Aggregated summaries (monthly totals, category breakdowns, merchant profiles)
- Individual recent transactions (last 90 days)
- Month-by-month merchant spending trends

Produce TWO things:

1. HEALTH ASSESSMENT: Score 0-100, one-line summary, color (green ≥70, yellow 40-69, red <40), and 4-5 key metrics.

2. INSIGHTS: Exactly 3-5 insights. Each MUST be one of these types:
   - behavioral_shift: A change in spending behavior over time, cross-correlating categories or merchants. "Your grocery spending dropped 30% but food delivery doubled — you shifted from cooking to ordering."
   - money_leak: Specific waste you can identify — unused subscriptions, redundant services, fees that could be avoided, merchants where spending crept up unnoticed.
   - projection: A forward-looking warning or encouragement based on trends. "At this rate, your dining spend will exceed groceries by March" or "Your savings rate improved 3 months in a row."

You MUST include at least one of each type.

QUALITY BAR — every insight must:
- Reference specific merchants and dollar amounts from the data
- Compare two time periods or two categories (not just state a fact)
- Explain WHY something matters, not just WHAT happened
- Be something the person couldn't see by glancing at a pie chart

EXAMPLES OF GREAT INSIGHTS:
- "Your weekend spending averaged $180/day in January vs $45 on weekdays — driven by 6 restaurant visits at Nobu and Chez Panisse totaling $420. In December this gap was only $90 vs $50. A new weekend dining habit is forming that adds ~$360/month."
- "You're paying for Netflix ($15.99), Hulu ($17.99), and Disney+ ($13.99) — $47.97/month in streaming. Netflix had no activity since October based on your transaction pattern. Canceling it saves $192/year."
- "Your savings rate dropped from 36% to 30% over 3 months. The driver isn't big purchases — it's $200/month more in small Food Delivery transactions (avg $18 each, up from $12). At this trajectory you'll save $1,800 less this year."

EXAMPLES OF BAD INSIGHTS (do NOT produce these):
- "You spend more on Fridays than other days." (obvious, no context, no action)
- "Groceries is your top spending category." (user can see this on charts)
- "Consider creating a budget." (generic advice, not data-specific)

ACCURACY: Every number must come from the provided data. Do not invent merchants or amounts.
```

**Anthropic user prompt:**

```
Here is the financial data. Date range: {date_range}. Transaction count (90 days): {txn_count}.

<aggregated_data>
{data_json}
</aggregated_data>

<recent_transactions>
{recent_txns_json}
</recent_transactions>

<merchant_trends>
{merchant_deltas_json}
</merchant_trends>

Return ONLY valid JSON in this exact format:
{
  "health": {
    "score": 0-100,
    "summary": "one line",
    "color": "green|yellow|red",
    "metrics": [{"label": "...", "value": "...", "trend": "up|down|stable", "sentiment": "good|neutral|bad"}]
  },
  "insights": [
    {
      "type": "behavioral_shift|money_leak|projection",
      "headline": "Short title",
      "severity": "concerning|notable|favorable",
      "explanation": "3-5 sentences, narrative style with specific numbers",
      "evidence": {"merchants": [], "categories": [], "amounts": {"key": 123}, "time_period": ""},
      "action": "One concrete action (optional)"
    }
  ]
}
```

**OpenAI prompts:** Same content but use markdown headers instead of XML tags. The `<aggregated_data>` sections become `## Aggregated Data`, etc.

Export a single function: `getFinancialAnalysisPrompt(provider: ProviderName): PromptTemplate`

**Step 4: Rewrite analyze-finances.ts**

Replace the contents of `src/lib/llm/analyze-finances.ts`:

```typescript
import type { LLMProvider, ProviderName } from './types'
import { getFinancialAnalysisPrompt } from './prompts/insights'
import { financialAnalysisSchema } from './schemas'
import type { CompactFinancialData } from '@/lib/insights/compact-data'
import type { HealthAssessment, Insight } from '@/lib/insights/types'

function stripCodeFences(text: string): string {
  return text.trim().replace(/^`{3,}(?:json)?\s*\n?/, '').replace(/\n?`{3,}\s*$/, '')
}

export async function analyzeFinances(
  provider: LLMProvider,
  providerName: ProviderName,
  data: CompactFinancialData,
  model: string
): Promise<{ health: HealthAssessment; insights: Insight[] }> {
  const prompt = getFinancialAnalysisPrompt(providerName)

  // Build context line
  const months = data.monthly.map(m => m.month)
  const dateRange = months.length > 0 ? `${months[0]} to ${months[months.length - 1]}` : 'no data'
  const txnCount = data.recent_transactions.length

  // Separate recent_transactions and merchant_month_deltas from aggregated data
  const { recent_transactions, merchant_month_deltas, ...aggregated } = data

  const filledPrompt = prompt.user
    .replace('{date_range}', dateRange)
    .replace('{txn_count}', String(txnCount))
    .replace('{data_json}', JSON.stringify(aggregated))
    .replace('{recent_txns_json}', JSON.stringify(recent_transactions))
    .replace('{merchant_deltas_json}', JSON.stringify(merchant_month_deltas))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const parsed = JSON.parse(stripCodeFences(response.text))
  const result = financialAnalysisSchema.parse(parsed)

  return {
    health: result.health,
    insights: result.insights.map((insight, i) => ({
      id: `llm-insight-${i}`,
      ...insight,
    })),
  }
}
```

Note: Keep the old `analyzeHealthAndPatterns` and `analyzeDeepInsights` exports temporarily (mark them `@deprecated`) until Task 5 updates the API route. This avoids breaking the build between tasks.

**Step 5: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/llm/analyze-finances.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/llm/prompts/insights.ts src/lib/llm/analyze-finances.ts src/__tests__/lib/llm/analyze-finances.test.ts
git commit -m "feat: merge LLM calls into single analyzeFinances with rewritten prompt"
```

---

### Task 5: Update API route and default model

**Files:**
- Modify: `src/app/api/insights/route.ts`
- Modify: `src/lib/llm/config.ts`

**Step 1: Update default model in `config.ts`**

In `src/lib/llm/config.ts`, change:
- `anthropic.defaults.insights` from `'claude-haiku-4-5-20251001'` to `'claude-sonnet-4-5-20250929'`
- `openai.defaults.insights` from `'gpt-5-mini'` to `'gpt-5'`

**Step 2: Rewrite the API route**

In `src/app/api/insights/route.ts`:

1. Replace imports: `analyzeHealthAndPatterns, analyzeDeepInsights` → `analyzeFinances`
2. Replace `PatternCard, DeepInsight` imports → `Insight`
3. Add `InsightsResponseV2` import (or just use inline type — this gets cleaned up in Task 6)

4. Simplify `generateInsights`:
```typescript
async function generateInsights(cacheKey: string) {
  try {
    const db = getDb()
    const { provider, providerName, model } = getProviderForTask(db, 'insights')
    const compactData = buildCompactData(db)
    const totalTxns = compactData.monthly.reduce((s, m) => s + m.spending, 0)

    if (totalTxns === 0) {
      console.log('[insights] No transactions found — skipping generation')
      return
    }

    console.log(`[insights] Starting generation (${providerName}/${model}, ${compactData.monthly.length} months, ${compactData.recent_transactions.length} recent txns)`)

    try {
      const t0 = Date.now()
      const { health, insights } = await analyzeFinances(provider, providerName, compactData, model)
      console.log(`[insights] Analysis complete — score: ${health?.score ?? 'n/a'}, ${insights.length} insights (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
      setCachedInsights(db, cacheKey, { health, insights })
      console.log('[insights] Results cached ✓')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[insights] Analysis FAILED — ${message}`)
    }
  } finally {
    generationInProgress.delete(cacheKey)
  }
}
```

5. Update `buildResponse` — remove `patterns` parameter, change `allInsights` type from `DeepInsight[]` to `Insight[]`:
```typescript
function buildResponse(
  status: 'ready' | 'generating',
  health: HealthAssessment | null,
  monthlyFlow: InsightsResponse['monthlyFlow'],
  allInsights: Insight[],
  dismissedIds: Set<string>,
): InsightsResponse {
  const filteredInsights = allInsights.filter(i => !dismissedIds.has(i.id))
  return {
    status,
    health,
    monthlyFlow,
    insights: filteredInsights,
    dismissedCount: allInsights.length - filteredInsights.length,
    generatedAt: new Date().toISOString(),
  }
}
```

6. Update `GET` handler to pass updated args (remove `patterns` from `buildResponse` calls, update cache shape parsing).

**Step 3: Run full tests**

Run: `npm test`
Expected: PASS (or some insight page tests may need updating — fix in next task)

**Step 4: Commit**

```bash
git add src/app/api/insights/route.ts src/lib/llm/config.ts
git commit -m "feat: wire single analyzeFinances call into API route, default to Sonnet"
```

---

### Task 6: Update types, clean up old code, and simplify UI

**Files:**
- Modify: `src/lib/insights/types.ts` — rename `InsightsResponseV2` → `InsightsResponse`, remove old `PatternCard`, `DeepInsight`, old `InsightsResponse`
- Delete: `src/components/insights/pattern-grid.tsx`
- Modify: `src/app/(app)/insights/page.tsx` — remove pattern grid, update to use `Insight` type, remove carousel (3-5 insights don't need pagination)
- Modify: `src/lib/llm/analyze-finances.ts` — remove deprecated `analyzeHealthAndPatterns` and `analyzeDeepInsights`
- Modify: `src/lib/llm/schemas.ts` — remove old `healthAndPatternsSchema`, `deepInsightSchema`, `patternCardSchema` (keep `healthAssessmentSchema` as it's used by `financialAnalysisSchema`)

**Step 1: Update `types.ts`**

Remove `PatternCard`, `DeepInsight`, old `InsightsResponse`. Rename `InsightsResponseV2` → `InsightsResponse`. Keep `HealthAssessment`, `HealthMetric`, `InsightSeverity`, `MonthlyFlow`.

**Step 2: Update `insights/page.tsx`**

Key changes to the page component:
- Remove `PatternGrid` import and usage
- Remove `patterns` references (`data.patterns`, skeleton patterns section)
- Change `InsightsResponse` import to use new type (no `patterns` field)
- Update `InsightCard` to use `Insight` type instead of `DeepInsight`:
  - Replace `insight.key_metric` with type badge (`insight.type` displayed as a label)
  - Replace `insight.action_suggestion` with `insight.action`
  - Show `insight.explanation` directly (it's now 3-5 sentences, richer)
- Remove carousel pagination (3-5 insights don't need it) — just show all insights
- Remove `carouselIndex`, `pageSize`, `pageCount`, `page`, `visibleInsights` state/computed
- Add a type badge/icon per insight type:
  - `behavioral_shift` → no special styling (default)
  - `money_leak` → subtle red-ish indicator
  - `projection` → subtle blue-ish indicator
- Update `hasContent` check: remove `patterns` reference
- Update `isEmpty` check: remove `patterns` reference

The `InsightCard` component becomes:
```tsx
function InsightCard({ insight, expanded, onToggle }: { insight: Insight; expanded: boolean; onToggle: () => void }) {
  const typeLabel = { behavioral_shift: 'Behavior', money_leak: 'Leak', projection: 'Trend' }
  return (
    <Card
      className={`p-3 border-l-2 ${severityColor[insight.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabel[insight.type]}</span>
      </div>
      <p className="text-xs font-medium leading-tight mt-1">{insight.headline}</p>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
          {insight.action && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{insight.action}</p>
          )}
        </div>
      )}
    </Card>
  )
}
```

**Step 3: Clean up old exports**

- `src/lib/llm/analyze-finances.ts`: Remove `analyzeHealthAndPatterns`, `analyzeDeepInsights`, `buildSummaryStats`
- `src/lib/llm/schemas.ts`: Remove `healthAndPatternsSchema`, `patternCardSchema`, `deepInsightSchema`, `llmInsightSchema`, and their type exports (`HealthAndPatternsResult`, `DeepInsightResult`, `LLMInsightData`)
- `src/lib/llm/prompts/insights.ts`: Remove old `HEALTH_AND_PATTERNS_PROMPTS`, `DEEP_INSIGHTS_PROMPTS`, `getHealthAndPatternsPrompt`, `getDeepInsightsPrompt` (if not already removed in Task 4)

**Step 4: Delete `pattern-grid.tsx`**

Remove `src/components/insights/pattern-grid.tsx` entirely.

**Step 5: Run full tests**

Run: `npm test`
Expected: PASS — fix any remaining test references to old types/functions

**Step 6: Run build**

Run: `npm run build`
Expected: PASS — no TypeScript errors from stale references

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove pattern grid, simplify insights UI for unified insight cards"
```

---

### Task 7: Update SAMPLE_DATA in any remaining tests

**Files:**
- Check: `src/__tests__/` for any files importing old types or functions

**Step 1: Search for stale references**

Search for `analyzeHealthAndPatterns`, `analyzeDeepInsights`, `PatternCard`, `DeepInsight`, `patterns:`, `patternCardSchema`, `deepInsightSchema` across `src/__tests__/`.

**Step 2: Fix any remaining references**

Update test files to use `analyzeFinances`, `Insight`, `financialAnalysisSchema`.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit (if changes needed)**

```bash
git add -A
git commit -m "test: update remaining test references for unified insights"
```
