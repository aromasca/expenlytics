# High-Signal Financial Insights

**Date:** 2026-02-15
**Status:** Approved

## Problem

The LLM-generated insights are shallow and noisy. Three compounding issues:

1. **Data compaction is lossy in the wrong ways.** The LLM sees aggregated totals (top 30 merchants, top 15 categories by month, day-of-week averages) but can't see individual transactions or month-over-month merchant trends. It knows you spent $500 at Amazon but not whether that's 50 small purchases or 2 big ones, or whether Amazon spending is trending up.

2. **Two LLM calls receive identical data.** `analyzeHealthAndPatterns` and `analyzeDeepInsights` both get the same `compact-data.ts` output. The second call is told to "go deeper" but has nothing deeper to work with — so it rephrases the same aggregates.

3. **8-12 insights forces padding.** Asking for that volume from aggregated data makes the LLM produce obvious observations ("you spend more on weekends") to hit the quota.

## Design

### Data Layer (`compact-data.ts`)

Add two new fields to `CompactFinancialData`:

- **`recent_transactions`**: Last 90 days of individual transactions — `{ date, description, normalized_merchant, amount, type, category, transaction_class }`. Sorted by date descending. ~200 rows, ~6K tokens. This lets the LLM see what you actually bought.

- **`merchant_month_deltas`**: Top 20 merchants with spending per month for last 6 months. Format: `{ merchant, months: { "2026-01": 45.00, "2026-02": 78.50 } }`. Lets the LLM spot trends like "DoorDash doubled" without computing from raw transactions.

All existing aggregates are retained as pre-computed summaries.

### LLM Call Restructure (`analyze-finances.ts`)

Merge two calls into one. Replace `analyzeHealthAndPatterns` + `analyzeDeepInsights` with a single `analyzeFinances` call returning:

- Health score + metrics (same as today)
- 3-5 insights (down from 6-8 patterns + 8-12 deep insights)

Each insight has a `type` field: `behavioral_shift`, `money_leak`, or `projection` — ensuring coverage of all three insight categories.

Default model for insights task changes from Haiku to Sonnet.

### Prompt Rewrite (`prompts/insights.ts`)

Key changes:

- **Show don't tell.** Include 2-3 examples of excellent vs. mediocre insights instead of listing abstract rules.
  - Bad: "You spend more on weekends than weekdays."
  - Good: "Your weekend spending averaged $180/day in January vs. $45 on weekdays — driven by 6 restaurant visits totaling $420. In December this gap was only $90 vs. $50, suggesting a new weekend dining habit forming."

- **Enforce 3 types explicitly.** Must include at least one `behavioral_shift`, one `money_leak`, one `projection`. 3-5 total.

- **Persona shift.** "You're reviewing a close friend's finances and want to tell them the 3-5 things they genuinely need to hear" instead of generic "financial analyst."

- **Remove redundant `buildSummaryStats`.** Replace hand-formatted text summary with brief context line (date range, months, transaction count). The JSON data already contains everything.

- **Raw transactions in separate labeled section** so the LLM knows to mine them for specific examples.

### Schema Changes (`schemas.ts` + `types.ts`)

Replace `healthAndPatternsSchema` + `deepInsightSchema` with single `financialAnalysisSchema`:

```json
{
  "health": { "score": 75, "summary": "...", "color": "green", "metrics": [] },
  "insights": [
    {
      "type": "behavioral_shift | money_leak | projection",
      "headline": "short title",
      "severity": "concerning | notable | favorable",
      "explanation": "3-5 sentences, narrative style",
      "evidence": {
        "merchants": [],
        "categories": [],
        "amounts": { "key": 123.45 },
        "time_period": "Jan 2026 vs Dec 2025"
      },
      "action": "one concrete suggestion (optional)"
    }
  ]
}
```

Changes from current:
- `key_metric` removed — metric woven into explanation
- `amounts` added to evidence — forces cited dollar figures
- `type` replaces `category` — 3 insight types instead of 5 vague categories
- `informational` severity dropped — every insight should have valence
- `PatternCard` type eliminated — patterns and deep insights merge into `Insight`

### API / Caching

- Cache key and invalidation logic unchanged
- Cached data shape changes — stale entries handled via try/catch on parse, regenerated on next request
- `InsightsResponse` type loses `patterns` field

### UI Impact

- Insights page simplifies: single list of 3-5 insight cards instead of patterns grid + deep insight cards
- Each card shows type badge, headline, narrative explanation, evidence, optional action

## Files Changed

| File | Change |
|------|--------|
| `src/lib/insights/compact-data.ts` | Add `recent_transactions` + `merchant_month_deltas` |
| `src/lib/llm/analyze-finances.ts` | Merge 2 calls → 1, export `analyzeFinances` |
| `src/lib/llm/prompts/insights.ts` | Full rewrite with examples, types, persona |
| `src/lib/llm/schemas.ts` | Single `financialAnalysisSchema` |
| `src/lib/insights/types.ts` | Merge types → `Insight` with `type` field |
| `src/lib/llm/config.ts` | Default insights to Sonnet |
| `src/app/api/insights/route.ts` | Use new `analyzeFinances`, adapt response shape |
| `src/components/insights/*` | Simplify to unified insight cards |
| `src/app/(app)/insights/page.tsx` | Remove patterns section |
| `src/__tests__/lib/llm/analyze-finances.test.ts` | Update for new single-call structure |
| `src/__tests__/lib/insights/compact-data.test.ts` | Test new fields |
