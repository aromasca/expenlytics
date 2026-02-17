# Insights Redesign — Account & Commitment Aware Alert Feed

## Problem

The insights page produces generic, unfocused observations. The LLM lacks two high-signal data sources (accounts and curated commitments) and the UI treats all insights equally rather than prioritizing what needs attention.

## Approach

Enrich the LLM's context with account summaries and active commitments, rewrite the prompt to produce priority-ranked alerts, expand the insight type taxonomy, and redesign the UI as an alert feed with deep-linked entity references.

---

## 1. Data Enrichment

### New compact-data sections

**`account_summaries`** — per-account spending profiles:
```typescript
account_summaries: Array<{
  name: string           // "Chase Sapphire (...4521)"
  type: string           // "credit_card" | "checking" etc.
  months: Record<string, { spending: number; income: number; txn_count: number }>
  top_categories: Array<{ category: string; total: number }>
  top_merchants: Array<{ name: string; total: number }>
}>
```
Join `transactions -> document_accounts -> accounts`, group by account + month. Top 3 categories and top 5 merchants per account.

**`active_commitments`** — curated commitment baseline (replaces raw `commitments` section):
```typescript
active_commitments: Array<{
  merchant: string
  frequency: string
  estimated_monthly: number
  recent_amounts: number[]    // last 3-4 charge amounts (drift detection)
  first_seen: string
  last_seen: string
  category: string
  account?: string            // which account it's charged to
}>
```
Uses existing `getCommitments()`, filters to active only (excludes ended/not_recurring from `commitment_status`), joins to accounts via transactions.

**`commitment_baseline`** — summary stat:
```typescript
commitment_baseline: {
  total_monthly: number       // sum of all active estimated_monthly
  count: number
}
```

## 2. Insight Type Taxonomy

Expand from 3 to 6 types:

| Type | Description |
|------|-------------|
| `behavioral_shift` | Spending pattern changes across categories/merchants (existing) |
| `money_leak` | Waste, redundant services, avoidable fees (existing) |
| `projection` | Forward-looking trend warnings or encouragement (existing) |
| `commitment_drift` | Price changes, new commitments, account shifts for commitments (new) |
| `account_anomaly` | Unusual activity scoped to a specific account (new) |
| `baseline_gap` | Gap between commitment baseline and actual spending (new) |

Severity levels unchanged: `concerning`, `notable`, `favorable`, `informational`.

## 3. Prompt Rewrite

### User message template additions
Two new XML sections:
```
<account_profiles>
{account_summaries_json}
</account_profiles>

<commitment_baseline>
{active_commitments_json}
Total monthly baseline: ${total_monthly} across ${count} commitments
</commitment_baseline>
```

### System prompt changes
- Reframe from "produce 3-5 insights" to "produce 5-8 alerts ranked by urgency"
- Priority ranking:
  - P1: Money leaving unexpectedly (commitment drift, new unknown charges, account anomalies)
  - P2: Structural shifts (baseline gap growing, category migrations between accounts)
  - P3: Behavioral patterns (behavioral_shift, money_leak, projection)
- New examples for each new type
- Drop "MUST include at least one of each type" constraint — let data drive type allocation
- Instruct LLM to include entity references in evidence for deep linking

### Evidence schema additions
```typescript
evidence: {
  merchants?: string[]
  categories?: string[]
  amounts?: Record<string, number>
  time_period?: string
  accounts?: string[]          // NEW
  commitment_merchant?: string // NEW
}
```

## 4. UI Redesign

### New page structure (top to bottom)

1. **Header row** — title + refresh + timestamp
2. **Health score strip** — compressed to single horizontal line: score, color dot, summary, metric badges inline
3. **Alert feed** — primary content, cards sorted by LLM priority:
   - Left border color by severity (red/amber/emerald/zinc)
   - Type badge: "Drift", "Anomaly", "Baseline", "Behavior", "Leak", "Trend"
   - Headline + click-to-expand explanation
   - Deep-linked entities: merchant names -> `/transactions?merchant=X`, category names -> `/transactions?category=X`, account names -> `/accounts`
   - Multiple cards can be expanded simultaneously
   - Dismiss on hover (existing)
4. **Income vs Outflow chart** — moved below alert feed
5. **Footer links** — Reports, Transactions, Commitments, Accounts

### Deep link implementation
Scan explanation text for exact matches against evidence arrays (merchants, categories, accounts). Wrap matches in `<Link>` with appropriate query params. No markdown parsing — string matching against known entity names.

## 5. Cache Invalidation

Expand cache key hash to include:
- Existing: `last_debit_date + txn_count + total_amount`
- New: `active_commitment_count + baseline_total + account_count`

Ensures commitment edits and account changes trigger re-generation.
