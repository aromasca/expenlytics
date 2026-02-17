# Insights Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the insights page produce account-aware, commitment-aware, priority-ranked alerts with deep-linked entity references.

**Architecture:** Enrich `buildCompactData()` with account summaries and active commitments, expand the insight type taxonomy from 3 to 6, rewrite the LLM prompt to produce priority-ranked alerts, redesign the UI as an alert feed with a compressed health strip and deep-linked entities, and update cache invalidation.

**Tech Stack:** Next.js App Router, better-sqlite3, Zod, Recharts, Anthropic/OpenAI SDK, shadcn/ui

---

### Task 1: Expand Insight Types and Zod Schemas

**Files:**
- Modify: `src/lib/insights/types.ts`
- Modify: `src/lib/llm/schemas.ts:147-152` (insightTypeSchema)
- Modify: `src/lib/llm/schemas.ts:154-169` (financialAnalysisSchema)

**Step 1: Update InsightType union**

In `src/lib/insights/types.ts`, change the `InsightType` from:
```typescript
export type InsightType = 'behavioral_shift' | 'money_leak' | 'projection'
```
to:
```typescript
export type InsightType = 'behavioral_shift' | 'money_leak' | 'projection' | 'commitment_drift' | 'account_anomaly' | 'baseline_gap'
```

**Step 2: Update evidence interface**

In `src/lib/insights/types.ts`, add two fields to the `evidence` object in the `Insight` interface:
```typescript
evidence: {
  merchants?: string[]
  categories?: string[]
  amounts?: Record<string, number>
  time_period?: string
  accounts?: string[]
  commitment_merchant?: string
}
```

**Step 3: Update insightTypeSchema in schemas.ts**

In `src/lib/llm/schemas.ts:147-152`, expand the `insightTypeSchema` transform to handle the new types:
```typescript
export const insightTypeSchema = z.string().transform((v): 'behavioral_shift' | 'money_leak' | 'projection' | 'commitment_drift' | 'account_anomaly' | 'baseline_gap' => {
  if (['behavioral_shift', 'behavior', 'shift', 'correlation'].includes(v)) return 'behavioral_shift'
  if (['money_leak', 'leak', 'waste', 'subscription'].includes(v)) return 'money_leak'
  if (['projection', 'trend', 'forecast', 'warning'].includes(v)) return 'projection'
  if (['commitment_drift', 'drift', 'price_change', 'commitment'].includes(v)) return 'commitment_drift'
  if (['account_anomaly', 'anomaly', 'account'].includes(v)) return 'account_anomaly'
  if (['baseline_gap', 'baseline', 'gap', 'overrun'].includes(v)) return 'baseline_gap'
  return 'behavioral_shift'
})
```

**Step 4: Update financialAnalysisSchema evidence**

In `src/lib/llm/schemas.ts:161-166`, add the two new optional fields to the evidence object:
```typescript
evidence: z.object({
  merchants: stringOrArraySchema,
  categories: stringOrArraySchema,
  amounts: z.record(z.string(), z.number()).optional(),
  time_period: z.string().optional(),
  accounts: stringOrArraySchema,
  commitment_merchant: z.string().optional(),
}),
```

**Step 5: Run tests to verify nothing breaks**

Run: `npm test -- src/__tests__/lib/insights/`
Expected: All existing tests pass (schema changes are backward-compatible — new fields are optional)

**Step 6: Commit**

```bash
git add src/lib/insights/types.ts src/lib/llm/schemas.ts
git commit -m "feat: expand insight types with commitment_drift, account_anomaly, baseline_gap"
```

---

### Task 2: Enrich Compact Data with Account Summaries and Active Commitments

**Files:**
- Modify: `src/lib/insights/compact-data.ts:4-22` (CompactFinancialData interface)
- Modify: `src/lib/insights/compact-data.ts:26-258` (buildCompactData function)
- Modify: `src/__tests__/lib/insights/compact-data.test.ts`

**Step 1: Write failing tests for new data sections**

Add to `src/__tests__/lib/insights/compact-data.test.ts`:

```typescript
it('includes active_commitments from curated commitment data', () => {
  const db = createDb()
  // Create 3 monthly charges for Acme SaaS
  insertTx(db, { date: monthsAgo(1), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(2), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(3), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  const data = buildCompactData(db)
  expect(data.active_commitments).toBeDefined()
  expect(data.active_commitments.length).toBeGreaterThanOrEqual(1)
  const acme = data.active_commitments.find(c => c.merchant === 'Acme SaaS')
  expect(acme).toBeDefined()
  expect(acme!.frequency).toBe('monthly')
  expect(acme!.recent_amounts).toHaveLength(3)
  expect(acme!.category).toBe('SaaS & Subscriptions')
})

it('excludes ended commitments from active_commitments', () => {
  const db = createDb()
  insertTx(db, { date: monthsAgo(1), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(2), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(3), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  // Mark as ended
  db.prepare("INSERT INTO commitment_status (normalized_merchant, status) VALUES ('Acme SaaS', 'ended')").run()
  const data = buildCompactData(db)
  const acme = data.active_commitments.find(c => c.merchant === 'Acme SaaS')
  expect(acme).toBeUndefined()
})

it('includes commitment_baseline totals', () => {
  const db = createDb()
  insertTx(db, { date: monthsAgo(1), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(2), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(3), description: 'Acme SaaS', amount: 50, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(1), description: 'Acme Cloud', amount: 20, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(2), description: 'Acme Cloud', amount: 20, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })
  insertTx(db, { date: monthsAgo(3), description: 'Acme Cloud', amount: 20, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })
  const data = buildCompactData(db)
  expect(data.commitment_baseline).toBeDefined()
  expect(data.commitment_baseline.count).toBe(2)
  expect(data.commitment_baseline.total_monthly).toBeGreaterThan(0)
})

it('includes account_summaries when accounts exist', () => {
  const db = createDb()
  // Create an account
  db.prepare("INSERT INTO accounts (name, institution, last_four, type) VALUES ('Test Checking', 'Acme Bank', '1234', 'checking_account')").run()
  const accountId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  // Insert a document and link to account
  db.prepare("INSERT INTO documents (filename, filepath, status, file_hash) VALUES ('stmt.pdf', '/tmp/stmt.pdf', 'completed', 'hash-acct-test')").run()
  const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  db.prepare("INSERT INTO document_accounts (document_id, account_id) VALUES (?, ?)").run(docId, accountId)
  // Insert transaction linked to that document
  const catId = getCategoryId(db, 'Groceries')
  db.prepare("INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, 'Acme Grocery', 100, 'debit', ?, 'Acme Grocery')").run(docId, monthsAgo(1), catId)
  const data = buildCompactData(db)
  expect(data.account_summaries).toBeDefined()
  expect(data.account_summaries.length).toBe(1)
  expect(data.account_summaries[0].name).toContain('Acme Bank')
  expect(data.account_summaries[0].type).toBe('checking_account')
  expect(Object.keys(data.account_summaries[0].months).length).toBeGreaterThanOrEqual(1)
})

it('returns empty account_summaries when no accounts exist', () => {
  const db = createDb()
  insertTx(db, { date: monthsAgo(1), description: 'Test', amount: 100, category: 'Groceries' })
  const data = buildCompactData(db)
  expect(data.account_summaries).toEqual([])
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: FAIL — `active_commitments`, `commitment_baseline`, `account_summaries` properties don't exist yet

**Step 3: Update CompactFinancialData interface**

In `src/lib/insights/compact-data.ts`, add to the interface (after `merchant_month_deltas`):
```typescript
active_commitments: Array<{
  merchant: string
  frequency: string
  estimated_monthly: number
  recent_amounts: number[]
  first_seen: string
  last_seen: string
  category: string
  account?: string
}>
commitment_baseline: {
  total_monthly: number
  count: number
}
account_summaries: Array<{
  name: string
  type: string
  months: Record<string, { spending: number; income: number; txn_count: number }>
  top_categories: Array<{ category: string; total: number }>
  top_merchants: Array<{ name: string; total: number }>
}>
```

**Step 4: Remove old commitments section from interface**

Remove the old `commitments` field from the interface:
```typescript
// REMOVE THIS:
commitments: Array<{ merchant: string; amount: number; frequency: string; months: number }>
```

**Step 5: Implement active_commitments query**

Replace the existing `commitmentRows` query block (lines ~141-167) in `buildCompactData()` with:
```typescript
// Active commitments (curated — excludes ended/not_recurring)
const endedMerchants = new Set(
  (db.prepare("SELECT normalized_merchant FROM commitment_status WHERE status IN ('ended', 'not_recurring')").all() as Array<{ normalized_merchant: string }>)
    .map(r => r.normalized_merchant.toLowerCase())
)

const excludedTxIds = new Set(
  (db.prepare("SELECT transaction_id FROM excluded_commitment_transactions").all() as Array<{ transaction_id: number }>)
    .map(r => r.transaction_id)
)

const commitmentTxRows = db.prepare(`
  SELECT t.id, t.date, t.description, t.normalized_merchant, t.amount, t.type,
         c.name as category_name, c.color as category_color
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.type = 'debit'
    AND t.normalized_merchant IS NOT NULL
    AND COALESCE(c.exclude_from_totals, 0) = 0
  ORDER BY t.date ASC
`).all() as Array<{ id: number; date: string; description: string; normalized_merchant: string | null; amount: number; type: 'debit' | 'credit'; category_name: string | null; category_color: string | null }>

const filteredCommitmentTxs = commitmentTxRows.filter(t => !excludedTxIds.has(t.id))
const commitmentGroups = detectCommitmentGroups(filteredCommitmentTxs)

// Filter to active only and build compact representation
const active_commitments = commitmentGroups
  .filter(g => !endedMerchants.has(g.merchantName.toLowerCase()))
  .map(g => {
    // Get last 4 transaction amounts for drift detection
    const txnAmounts = filteredCommitmentTxs
      .filter(t => t.normalized_merchant?.toLowerCase() === g.merchantName.toLowerCase())
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4)
      .map(t => Math.round(t.amount * 100) / 100)

    // Try to find which account this commitment is charged to
    const lastTxn = filteredCommitmentTxs
      .filter(t => t.normalized_merchant?.toLowerCase() === g.merchantName.toLowerCase())
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    const accountRow = lastTxn ? db.prepare(`
      SELECT a.name, a.institution, a.last_four
      FROM document_accounts da
      JOIN accounts a ON da.account_id = a.id
      JOIN transactions t ON t.document_id = da.document_id
      WHERE t.id = ?
      LIMIT 1
    `).get(lastTxn.id) as { name: string; institution: string | null; last_four: string | null } | undefined : undefined

    const accountLabel = accountRow
      ? `${accountRow.institution ?? accountRow.name}${accountRow.last_four ? ` (...${accountRow.last_four})` : ''}`
      : undefined

    return {
      merchant: g.merchantName,
      frequency: g.frequency,
      estimated_monthly: Math.round(g.estimatedMonthlyAmount * 100) / 100,
      recent_amounts: txnAmounts,
      first_seen: g.firstDate,
      last_seen: g.lastDate,
      category: g.category ?? 'Other',
      account: accountLabel,
    }
  })

const commitment_baseline = {
  total_monthly: Math.round(active_commitments.reduce((s, c) => s + c.estimated_monthly, 0) * 100) / 100,
  count: active_commitments.length,
}
```

Add import at top of file:
```typescript
import { detectCommitmentGroups } from '@/lib/commitments'
```

**Step 6: Implement account_summaries query**

Add after the commitment block:
```typescript
// Account summaries (per-account spending profiles)
const accountRows = db.prepare(`
  SELECT a.id, a.name, a.institution, a.last_four, a.type,
         strftime('%Y-%m', t.date) as month,
         SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending,
         SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
         COUNT(*) as txn_count
  FROM accounts a
  JOIN document_accounts da ON da.account_id = a.id
  JOIN transactions t ON t.document_id = da.document_id
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE ${VALID_TRANSACTION_FILTER}
    AND t.date >= date('now', '-12 months')
  GROUP BY a.id, month
  ORDER BY a.id, month
`).all() as Array<{ id: number; name: string; institution: string | null; last_four: string | null; type: string; month: string; spending: number; income: number; txn_count: number }>

const accountCatRows = db.prepare(`
  SELECT a.id as account_id,
         COALESCE(c.name, 'Uncategorized') as category,
         SUM(t.amount) as total
  FROM accounts a
  JOIN document_accounts da ON da.account_id = a.id
  JOIN transactions t ON t.document_id = da.document_id
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    AND ${VALID_TRANSACTION_FILTER}
  GROUP BY a.id, category
  ORDER BY a.id, total DESC
`).all() as Array<{ account_id: number; category: string; total: number }>

const accountMerchantRows = db.prepare(`
  SELECT a.id as account_id,
         COALESCE(t.normalized_merchant, t.description) as merchant,
         SUM(t.amount) as total
  FROM accounts a
  JOIN document_accounts da ON da.account_id = a.id
  JOIN transactions t ON t.document_id = da.document_id
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.type = 'debit' AND t.date >= date('now', '-6 months')
    AND ${VALID_TRANSACTION_FILTER}
  GROUP BY a.id, COALESCE(t.normalized_merchant, t.description)
  ORDER BY a.id, total DESC
`).all() as Array<{ account_id: number; merchant: string; total: number }>

// Group by account
const acctMonthMap = new Map<number, { name: string; type: string; months: Record<string, { spending: number; income: number; txn_count: number }> }>()
for (const r of accountRows) {
  if (!acctMonthMap.has(r.id)) {
    const label = `${r.institution ?? r.name}${r.last_four ? ` (...${r.last_four})` : ''}`
    acctMonthMap.set(r.id, { name: label, type: r.type, months: {} })
  }
  acctMonthMap.get(r.id)!.months[r.month] = {
    spending: Math.round(r.spending * 100) / 100,
    income: Math.round(r.income * 100) / 100,
    txn_count: r.txn_count,
  }
}

const acctCatMap = new Map<number, Array<{ category: string; total: number }>>()
for (const r of accountCatRows) {
  if (!acctCatMap.has(r.account_id)) acctCatMap.set(r.account_id, [])
  const arr = acctCatMap.get(r.account_id)!
  if (arr.length < 3) arr.push({ category: r.category, total: Math.round(r.total * 100) / 100 })
}

const acctMerchantMap = new Map<number, Array<{ name: string; total: number }>>()
for (const r of accountMerchantRows) {
  if (!acctMerchantMap.has(r.account_id)) acctMerchantMap.set(r.account_id, [])
  const arr = acctMerchantMap.get(r.account_id)!
  if (arr.length < 5) arr.push({ name: r.merchant, total: Math.round(r.total * 100) / 100 })
}

const account_summaries = [...acctMonthMap.entries()].map(([id, acct]) => ({
  name: acct.name,
  type: acct.type,
  months: acct.months,
  top_categories: acctCatMap.get(id) ?? [],
  top_merchants: acctMerchantMap.get(id) ?? [],
}))
```

**Step 7: Update return statement**

Replace the old `commitments` in the return with the three new fields:
```typescript
return {
  monthly, categories, merchants, day_of_week, daily_recent,
  active_commitments, commitment_baseline, account_summaries,
  outliers, top_merchants_by_category, recent_transactions, merchant_month_deltas,
}
```

**Step 8: Run tests**

Run: `npm test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: PASS (including new tests). Note: the existing test `it('returns empty structure for no transactions')` will need its assertion updated from `data.commitments` to `data.active_commitments`.

**Step 9: Fix any existing test referencing old `commitments` field**

In the empty structure test, change:
```typescript
expect(data.commitments).toEqual([])
```
to:
```typescript
expect(data.active_commitments).toEqual([])
expect(data.commitment_baseline).toEqual({ total_monthly: 0, count: 0 })
expect(data.account_summaries).toEqual([])
```

**Step 10: Commit**

```bash
git add src/lib/insights/compact-data.ts src/__tests__/lib/insights/compact-data.test.ts
git commit -m "feat: enrich compact data with account summaries and active commitments"
```

---

### Task 3: Rewrite LLM Prompt

**Files:**
- Modify: `src/lib/llm/prompts/insights.ts`
- Modify: `src/lib/llm/analyze-finances.ts`

**Step 1: Rewrite the system prompt**

Replace the entire `FINANCIAL_ANALYSIS_PROMPTS` object in `src/lib/llm/prompts/insights.ts`. Both Anthropic and OpenAI versions should contain the same core instructions, formatted per provider convention.

Key changes to the system prompt:
- Change from "3-5 insights" to "5-8 alerts ranked by urgency"
- Add priority levels: P1 (money leaving unexpectedly), P2 (structural shifts), P3 (behavioral patterns)
- Add the 3 new insight types with descriptions and examples
- Remove "MUST include at least one of each type" constraint
- Add instruction to populate `accounts` and `commitment_merchant` in evidence for deep linking
- Add examples for commitment_drift, account_anomaly, and baseline_gap

System prompt structure for both providers:

```
You are reviewing a close friend's finances. Produce alerts ranked by how urgently the person should know — not generic observations.

You will receive:
- Aggregated summaries (monthly totals, category breakdowns, merchant profiles)
- Individual recent transactions (last 90 days)
- Month-by-month merchant spending trends
- Account profiles (per-account monthly spending, top categories, top merchants)
- Active commitments with recent charge amounts and estimated monthly baseline

Produce TWO things:

1. HEALTH ASSESSMENT: Score 0-100, one-line summary, color (green >=70, yellow 40-69, red <40), and 4-5 key metrics.

2. ALERTS: 5-8 alerts ranked by urgency. Each must be one of these types:

  Priority 1 — Money leaving unexpectedly:
  - commitment_drift: A commitment price changed, a new commitment appeared unnoticed, or a commitment moved to a different account.
  - account_anomaly: Unusual activity scoped to a specific account — spending spike, new merchants, category shift.

  Priority 2 — Structural shifts:
  - baseline_gap: The gap between committed baseline spending and actual spending. Where is the discretionary overflow going? Is the gap growing?

  Priority 3 — Behavioral patterns:
  - behavioral_shift: A change in spending behavior over time, cross-correlating categories or merchants.
  - money_leak: Specific waste — unused subscriptions, redundant services, fees, merchants where spending crept up.
  - projection: Forward-looking warning or encouragement based on trends.

Use whichever types the data supports. You do NOT need to use all types.

QUALITY BAR — every alert must:
- Reference specific merchants and dollar amounts from the data
- Compare two time periods, two accounts, or baseline vs actual
- Explain WHY something matters, not just WHAT happened
- Be something the person could not see by glancing at a pie chart

EVIDENCE FIELDS — for each alert, populate the evidence object so the UI can create links:
- merchants: array of merchant names mentioned
- categories: array of category names mentioned
- accounts: array of account names mentioned (e.g. "Chase (...4521)")
- commitment_merchant: the specific commitment merchant name if this is a commitment_drift alert
- amounts: key-value pairs of notable amounts
- time_period: the time range referenced

EXAMPLES OF GREAT ALERTS:

commitment_drift: "Acme Cloud went from $49.99 to $54.99 in the last two charges — a 10% increase you may not have approved. Over a year, that is $60 more than expected."

account_anomaly: "Your Chase card averaged $1,200/mo for 6 months but hit $1,800 in January — driven by 3 new merchants in Dining totaling $480. Your checking account deposits stayed flat."

baseline_gap: "Your committed baseline is $850/mo across 12 subscriptions, but actual spending averages $1,400. The $550/mo gap goes mostly to Dining ($220) and Shopping ($180). This gap grew from $400 three months ago."

behavioral_shift: "Your grocery spending dropped 30% but food delivery doubled — you shifted from cooking to ordering, adding ~$200/month."

money_leak: "You are paying for 3 streaming services ($48/mo total). One had no associated spending since October. Canceling it saves $192/year."

projection: "Your savings rate dropped from 36% to 30% over 3 months. The driver is $200/month more in small food delivery transactions. At this trajectory you will save $1,800 less this year."

EXAMPLES OF BAD ALERTS (do NOT produce these):
- "You spend more on Fridays than other days." (obvious, no action)
- "Groceries is your top category." (visible on charts)
- "Consider creating a budget." (generic, not data-specific)
- "Your spending increased this month." (no specifics, no WHY)

ACCURACY: Every number must come from the provided data. Do not invent merchants or amounts.
```

User prompt template (Anthropic uses XML tags, OpenAI uses markdown headers):

Anthropic:
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

<account_profiles>
{account_summaries_json}
</account_profiles>

<commitment_baseline>
{active_commitments_json}
Monthly baseline: ${baseline_total} across {baseline_count} active commitments
</commitment_baseline>

Return ONLY valid JSON matching the schema below. Alerts should be ordered by priority (P1 first, P3 last).
{json_schema}
```

OpenAI: same content but with `## Headers` instead of XML tags, and a fenced JSON schema block.

**Step 2: Update analyze-finances.ts to pass new data sections**

In `src/lib/llm/analyze-finances.ts`, update the template filling to extract and pass the new sections:

```typescript
const { recent_transactions, merchant_month_deltas, active_commitments, commitment_baseline, account_summaries, ...aggregated } = data

const filledPrompt = prompt.user
  .replace('{date_range}', dateRange)
  .replace('{txn_count}', String(txnCount))
  .replace('{data_json}', JSON.stringify(aggregated))
  .replace('{recent_txns_json}', JSON.stringify(recent_transactions))
  .replace('{merchant_deltas_json}', JSON.stringify(merchant_month_deltas))
  .replace('{account_summaries_json}', JSON.stringify(account_summaries))
  .replace('{active_commitments_json}', JSON.stringify(active_commitments))
  .replace('{baseline_total}', String(commitment_baseline.total_monthly))
  .replace('{baseline_count}', String(commitment_baseline.count))
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/lib/llm/prompts/insights.ts src/lib/llm/analyze-finances.ts
git commit -m "feat: rewrite insights prompt for priority-ranked alerts with account/commitment context"
```

---

### Task 4: Update Cache Invalidation

**Files:**
- Modify: `src/lib/db/insight-cache.ts:7-15` (generateCacheKey)

**Step 1: Update generateCacheKey to include commitment and account counts**

In `src/lib/db/insight-cache.ts`, change `generateCacheKey`:

```typescript
export function generateCacheKey(db: Database.Database): string {
  const row = db.prepare(`
    SELECT MAX(date) as last_date, COUNT(*) as count, SUM(amount) as total
    FROM transactions WHERE type = 'debit'
  `).get() as { last_date: string | null; count: number; total: number }

  const commitmentRow = db.prepare(`
    SELECT COUNT(*) as ended_count FROM commitment_status
  `).get() as { ended_count: number }

  const accountRow = db.prepare(`
    SELECT COUNT(*) as account_count FROM accounts
  `).get() as { account_count: number }

  const raw = `${row.last_date ?? ''}:${row.count}:${Math.round(row.total ?? 0)}:${commitmentRow.ended_count}:${accountRow.account_count}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/db/insight-cache.ts
git commit -m "feat: include commitment and account counts in insight cache key"
```

---

### Task 5: Add Deep Link Support to Transactions Page

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`

The transactions page currently initializes filters as `EMPTY_FILTERS`. Update it to read URL search params on mount so that deep links from insights work.

**Step 1: Add URL param reading**

In `src/app/(app)/transactions/page.tsx`, add `useSearchParams` import and initialize filters from URL:

```typescript
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// Inside the component:
const searchParams = useSearchParams()

const [filters, setFilters] = useState<Filters>(() => {
  const initial = { ...EMPTY_FILTERS }
  const search = searchParams.get('search')
  if (search) initial.search = search
  const categoryId = searchParams.get('category_id')
  if (categoryId) initial.category_ids = [categoryId]
  return initial
})
```

This allows links like `/transactions?search=Netflix` or `/transactions?category_id=5` to pre-filter the table.

**Step 2: Commit**

```bash
git add "src/app/(app)/transactions/page.tsx"
git commit -m "feat: support URL search params for deep linking to transactions"
```

---

### Task 6: Redesign Insights Page UI

**Files:**
- Modify: `src/components/insights/health-score.tsx` (compress to horizontal strip)
- Modify: `src/app/(app)/insights/page.tsx` (alert feed layout, deep links, multi-expand)

**Step 1: Compress HealthScore to a horizontal strip**

Replace the HealthScore component in `src/components/insights/health-score.tsx`:

```typescript
'use client'

import type { HealthAssessment } from '@/lib/insights/types'

const colorMap = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
}

const dotColor = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
}

const sentimentColor = {
  good: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-foreground',
  bad: 'text-red-600 dark:text-red-400',
}

const trendArrow = { up: '\u2191', down: '\u2193', stable: '\u2192' }

export function HealthScore({ health }: { health: HealthAssessment }) {
  return (
    <div className="flex items-center gap-3 flex-wrap" data-walkthrough="health-score">
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${dotColor[health.color]}`} />
        <span className={`text-lg font-semibold tabular-nums ${colorMap[health.color]}`}>
          {health.score}
        </span>
        <span className="text-xs text-muted-foreground">{health.summary}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {health.metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-1 rounded border px-2 py-0.5">
            <span className="text-[10px] text-muted-foreground">{m.label}</span>
            <span className={`text-xs tabular-nums ${sentimentColor[m.sentiment]}`}>
              {m.value}
            </span>
            <span className={`text-[10px] ${sentimentColor[m.sentiment]}`}>
              {trendArrow[m.trend]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Update InsightCard with deep links and new type labels**

In `src/app/(app)/insights/page.tsx`, update the type labels and add a deep link renderer:

```typescript
import Link from 'next/link'

const typeLabel: Record<string, string> = {
  behavioral_shift: 'Behavior',
  money_leak: 'Leak',
  projection: 'Trend',
  commitment_drift: 'Drift',
  account_anomaly: 'Anomaly',
  baseline_gap: 'Baseline',
}
```

Add a helper function to render explanation text with deep links:

```typescript
function renderExplanationWithLinks(explanation: string, evidence: Insight['evidence']) {
  // Build a map of entity -> link
  const linkMap: Array<{ text: string; href: string }> = []

  for (const merchant of evidence.merchants ?? []) {
    linkMap.push({ text: merchant, href: `/transactions?search=${encodeURIComponent(merchant)}` })
  }
  for (const category of evidence.categories ?? []) {
    linkMap.push({ text: category, href: `/transactions?search=${encodeURIComponent(category)}` })
  }
  for (const account of evidence.accounts ?? []) {
    linkMap.push({ text: account, href: '/accounts' })
  }
  if (evidence.commitment_merchant) {
    linkMap.push({ text: evidence.commitment_merchant, href: '/commitments' })
  }

  if (linkMap.length === 0) return explanation

  // Sort by length desc to match longer names first
  linkMap.sort((a, b) => b.text.length - a.text.length)

  // Split text by entity matches and interleave with links
  type Segment = { type: 'text'; value: string } | { type: 'link'; text: string; href: string }
  let segments: Segment[] = [{ type: 'text', value: explanation }]

  for (const link of linkMap) {
    const newSegments: Segment[] = []
    for (const seg of segments) {
      if (seg.type !== 'text') {
        newSegments.push(seg)
        continue
      }
      const parts = seg.value.split(link.text)
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) newSegments.push({ type: 'text', value: parts[i] })
        if (i < parts.length - 1) newSegments.push({ type: 'link', text: link.text, href: link.href })
      }
    }
    segments = newSegments
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <Link
            key={i}
            href={seg.href}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.text}
          </Link>
        )
      )}
    </>
  )
}
```

**Step 3: Update InsightCard to use deep links and support multi-expand**

Change the card to use `renderExplanationWithLinks` in the expanded view. Change state from single `expandedId` to a `Set<string>`:

```typescript
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

// Toggle function:
const toggleExpand = (id: string) => {
  setExpandedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
```

Update InsightCard to accept `expanded` boolean and use `renderExplanationWithLinks`:

```typescript
function InsightCard({ insight, expanded, onToggle }: { insight: Insight; expanded: boolean; onToggle: () => void }) {
  return (
    <Card
      className={`p-3 border-l-2 ${severityColor[insight.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabel[insight.type] ?? insight.type}</span>
      </div>
      <p className="text-xs font-medium leading-tight mt-1">{insight.headline}</p>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {renderExplanationWithLinks(insight.explanation, insight.evidence)}
          </p>
          {insight.action && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{insight.action}</p>
          )}
        </div>
      )}
    </Card>
  )
}
```

**Step 4: Restructure page layout**

Reorder the sections in the page JSX:
1. Header (unchanged)
2. Health score strip (replaces card-style health score)
3. Alert feed (primary content — insights)
4. Income vs Outflow chart (moved below alerts)
5. Footer links (add Accounts link)

The main changes:
- Move the `IncomeOutflowChart` section below the insights section
- Pass `expandedIds.has(insight.id)` and `() => toggleExpand(insight.id)` to each InsightCard
- Add Accounts link to footer

**Step 5: Run dev server and verify visually**

Run: `npm run dev`
Check: Navigate to `/insights`, verify layout renders correctly with compressed health strip and alert feed

**Step 6: Commit**

```bash
git add src/components/insights/health-score.tsx "src/app/(app)/insights/page.tsx"
git commit -m "feat: redesign insights page as priority-ranked alert feed with deep links"
```

---

### Task 7: Update Existing Tests and Run Full Suite

**Files:**
- Modify: `src/__tests__/lib/insights/compact-data.test.ts` (if any old `commitments` references remain)
- Run: full test suite

**Step 1: Search for any remaining references to old `commitments` field**

Search all test files and source files for `.commitments` that refer to the old compact data field (not the `getCommitments` function or other uses). The old field was `data.commitments` — now it's `data.active_commitments`.

**Step 2: Fix any remaining references**

Any code referencing `compactData.commitments` or `data.commitments` in the insights pipeline needs to be updated to `active_commitments`.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: update remaining references from commitments to active_commitments"
```
