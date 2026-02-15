# Financial Intelligence Redesign

**Date:** 2026-02-14
**Goal:** Transform the insights page into an LLM-powered financial intelligence hub — all analysis done by Claude, no heuristic thresholds.

## Philosophy

Instead of hardcoding pattern detection rules (">15% change", ">$50 threshold"), we send compact transaction data to the LLM and let it find what's interesting. The LLM is better at this because it understands context, can cross-correlate freely, and doesn't need predefined thresholds.

**Model:** Claude Haiku 4.5 for all analysis (~$0.01-0.03 per analysis).

## Architecture: Data Compaction → LLM Prompts → Structured Output

The critical challenge is fitting meaningful transaction data into LLM context cheaply. We solve this with a **data compaction layer** — SQL queries that pre-aggregate raw transactions into compact summaries, then send those summaries to specialized LLM prompts.

### Data Compaction Layer

Pure SQL/JS that produces compact JSON summaries. NOT for decision-making — just for shrinking data to fit in prompts.

```typescript
// src/lib/insights/compact-data.ts
interface CompactFinancialData {
  // Monthly totals (12 months)
  monthly: Array<{ month: string; income: number; spending: number; net: number }>

  // Category spending by month (6 months, top 15 categories)
  categories: Array<{ category: string; amounts: number[] /* per month */ }>

  // Merchant profile (top 30 by frequency + spend)
  merchants: Array<{
    name: string; total: number; count: number;
    avg: number; last_seen: string; first_seen: string;
    months_active: number
  }>

  // Day-of-week spending distribution
  day_of_week: Array<{ day: string; avg_spend: number; transaction_count: number }>

  // Daily spending for last 60 days (for temporal pattern detection)
  daily_recent: Array<{ date: string; amount: number; is_income_day: boolean }>

  // Recurring charges summary
  recurring: Array<{ merchant: string; amount: number; frequency: string; months: number }>

  // Recent outlier transactions (>2x category avg)
  outliers: Array<{ date: string; description: string; amount: number; category: string }>
}
```

This entire payload should be ~3-5KB of JSON — well within Haiku's context.

## Page Sections

### Section 1: Financial Health Assessment

**LLM prompt:** Given the monthly income/spending data, produce a health score (0-100), a one-line summary, and 4-5 key metrics with labels.

**Structured output:**
```typescript
interface HealthAssessment {
  score: number           // 0-100
  summary: string         // "Your finances are stable but savings rate is declining"
  color: 'green' | 'yellow' | 'red'
  metrics: Array<{
    label: string         // "Savings Rate", "Monthly Burn", etc.
    value: string         // "18%", "$4,200/mo", etc.
    trend: 'up' | 'down' | 'stable'
    sentiment: 'good' | 'neutral' | 'bad'
  }>
}
```

**Display:** Large score number + summary text + metric pills row. Minimal, data-dense.

### Section 2: Income vs Outflow Chart

**Data source:** `monthly` array from compact data (pure SQL, no LLM).
**Display:** Recharts grouped bar chart — emerald for income, zinc for spending. 240px. Net flow line overlay. This section is just a chart — no LLM needed for rendering data.

### Section 3: Patterns & Observations

**LLM prompt:** Given the full compact data (merchants, day-of-week, daily recent, recurring), find 6-8 behavioral patterns. Each pattern should be a specific, surprising observation with a concrete metric.

**Structured output:**
```typescript
interface PatternCard {
  id: string
  headline: string       // "Friday Night DoorDash Habit"
  metric: string         // "$180/mo on Friday food delivery"
  explanation: string    // 2-3 sentences
  category: 'timing' | 'merchant' | 'behavioral' | 'subscription' | 'correlation'
  severity: 'concerning' | 'notable' | 'favorable' | 'informational'
  evidence: {
    merchants?: string[]
    categories?: string[]
    time_period?: string
  }
}
```

**Display:** 2x3 grid of compact cards. Each card shows headline + metric. Expandable for explanation.

**What the LLM should find (not hardcoded — just prompt guidance):**
- Temporal patterns (payday spikes, weekend habits, day-of-week patterns)
- Merchant patterns (loyalty concentration, dormant subscriptions, price creep)
- Cross-category correlations (groceries down + delivery up = eating out more)
- Spending velocity (front-loading vs back-loading within months)
- Unusual recent behavior vs historical baseline

### Section 4: Deep Insights (existing carousel, upgraded)

**LLM prompt:** Same compact data, but prompted for deeper narrative insights — the "financial advisor" perspective. 8-12 insights with actionable suggestions.

**Keep existing carousel UI** with dismiss/reset. The insights themselves get much better because:
- The compact data includes merchant frequency/recency (not just spend)
- Day-of-week distributions enable temporal observations
- Daily recent data enables "last 60 days vs historical" comparisons
- Recurring charges data enables subscription intelligence

## LLM Call Strategy

**Two separate Haiku calls per page load:**

1. **Health + Patterns call** — compact data → health assessment + 6-8 pattern cards
   - Single prompt, two structured outputs
   - ~2-3K input tokens, ~1-2K output tokens
   - Cost: ~$0.01

2. **Deep insights call** — compact data + health results → 8-12 narrative insights
   - Receives health score as additional context
   - ~3-4K input tokens, ~2-3K output tokens
   - Cost: ~$0.02

**Caching:** Both results cached via existing `insight-cache` mechanism (cache key = hash of transaction data). Invalidated when transactions change.

**Total cost per analysis: ~$0.03. Cached until data changes.**

## What Gets Removed

- `src/lib/insights/detection.ts` — all heuristic detectors (category trends, lifestyle inflation, recurring growth, spending shifts) → replaced by LLM pattern detection
- `src/lib/insights/ranking.ts` — score ranking → LLM handles ordering
- `src/lib/insights/data-summary.ts` → replaced by `compact-data.ts` (richer, more structured)
- Current statistical insights collapsible section on insights page → gone
- Current heuristic insight cards → gone

**Keep:**
- `src/lib/insights/types.ts` — updated with new types
- `src/lib/db/insight-cache.ts` — caching layer stays
- `src/lib/claude/generate-insights.ts` — rewritten with new prompts
- Carousel UI component — kept, renders new insight format

## Page Layout

```
┌─────────────────────────────────────────┐
│  Health Score: 73                       │
│  "Stable finances, declining savings"   │
│  [Savings 18% ↓] [Burn $4.2K] [Subs 12%] [Buffer 3.2mo ↓]
├─────────────────────────────────────────┤
│  Income vs Outflow                      │
│  ██ ██ ██ ██ ██ ██ ██ ██ ██ ██ ██ ██   │
│  (emerald=income, zinc=spending)        │
├─────────────────────────────────────────┤
│  Patterns                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │Friday    │ │Payday    │ │Grocery ↓ ││
│  │delivery  │ │spike 2x  │ │Delivery ↑││
│  ├──────────┤ ├──────────┤ ├──────────┤│
│  │Dormant   │ │Weekend   │ │Top 5     ││
│  │gym $50/mo│ │+$45/day  │ │merch 34% ││
│  └──────────┘ └──────────┘ └──────────┘│
├─────────────────────────────────────────┤
│  AI Insights              [← 1/4 →]   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Deep     │ │ Deep     │ │ Deep     │ │
│  │ insight  │ │ insight  │ │ insight  │ │
│  └─────────┘ └─────────┘ └─────────┘  │
│  [Dismiss] [Reset]                      │
└─────────────────────────────────────────┘
```

## New Files

- `src/lib/insights/compact-data.ts` — SQL queries → CompactFinancialData
- `src/lib/claude/analyze-health.ts` — Haiku prompt for health score + patterns
- `src/lib/db/health.ts` — `getMonthlyIncomeVsSpending(db)` for the chart
- `src/components/insights/health-score.tsx` — score + metric pills
- `src/components/insights/income-outflow-chart.tsx` — Recharts grouped bar
- `src/components/insights/pattern-grid.tsx` — 2x3 pattern cards

## Modified Files

- `src/lib/claude/generate-insights.ts` — new prompt with compact data
- `src/lib/insights/types.ts` — new types (HealthAssessment, PatternCard)
- `src/app/(app)/insights/page.tsx` — new page layout
- `src/app/api/insights/route.ts` — new API shape returning all sections

## Technical Notes

- All data compaction is SQL + JS (no LLM) — just aggregation for context packing
- Zod schemas validate all LLM structured outputs
- No schema migrations — all data already in transactions table
- Haiku 4.5 model ID: `claude-haiku-4-5-20251001`
- Existing insight cache mechanism reused for both LLM calls
