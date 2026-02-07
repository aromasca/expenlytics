# Insights Dashboard Design
**Date:** 2026-02-07
**Status:** Approved

## Goal
Transform the home page into an insights dashboard that surfaces long-term financial health patterns, focusing on gradual changes over months/quarters that are easy to miss.

## User Needs
- **Primary goal**: Long-term financial health monitoring
- **Key concerns**: Category creep, lifestyle inflation, subscription bloat, spending shifts
- **Consumption preference**: Dashboard-first with expandable drill-down
- **Insight priority**: Recent + significant + concerning changes

## Architecture

### Page Structure
Home page (`/`) becomes insights dashboard with three zones:

**1. Hero Insights Section (Top)**
- Top 3-5 most important insights as prominent cards
- Smart ranking: recency + magnitude + severity
- Each card: bold headline + key metrics + mini sparkline
- Clickable to expand in-place for detailed drill-down

**2. Category Grid (Middle)**
- 2x2 grid (responsive to 1 column on mobile):
  - Category Trends - Spending categories creeping up
  - Lifestyle Inflation - Overall spending trajectory
  - Recurring Charges - Subscription/merchant growth
  - Spending Shifts - Money moving between categories
- Each section shows 2-3 relevant insights

**3. Quick Actions (Bottom)**
- Links to Reports, Transactions, Subscriptions
- Last updated timestamp + refresh button

### Data Flow
- API endpoint: `GET /api/insights`
- Server-side insight calculation from transaction history
- Comparison windows: month-over-month, quarter-over-quarter, year-over-year
- Client-side expansion loads detailed charts on-demand

## Smart Ranking Algorithm

Insights scored 0-100 points across three dimensions:

### Recency Score (0-40 points)
- Last 30 days: 40 points
- Last 60 days: 30 points
- Last 90 days: 20 points
- Older: 10 points

### Magnitude Score (0-40 points)
- Percentage change: 0-20 points (>50%=20, 25-50%=15, 10-25%=10, <10%=5)
- Dollar change: 0-20 points (>$500=20, $200-500=15, $50-200=10, <$50=5)

### Severity Score (0-20 points)
- Spending increase trends: 20 points
- New recurring charges: 15 points
- Category concentration (>60%): 15 points
- Spending decreases: 5 points (informational)

### Ranking Logic
- Top 5 scores populate hero section
- Only show insights scoring >30 points (no filler)
- Re-rank on each page load based on latest data

## Insight Types

### 1. Category Trends (Category Creep)
**Detection:**
- Compare category spending: current vs previous (month/quarter/year)
- Criteria: >15% increase AND >$50 absolute change

**Examples:**
- "Dining out increased 45% this quarter ($290 vs $200 last quarter)"
- "Entertainment spending up $120/month compared to last year"

**Visualization:**
- Mini: Sparkline showing category spending over 6 months
- Expanded: Bar chart with merchant breakdown within category

### 2. Lifestyle Inflation (Overall Trajectory)
**Detection:**
- Calculate rolling 3-month average spending
- Compare to previous 3-month periods
- Criteria: >10% increase sustained over multiple periods

**Examples:**
- "Average monthly spending increased from $2,400 to $2,850 over past 6 months (+19%)"
- "Your spending has grown 8% per quarter for the last 3 quarters"

**Visualization:**
- Mini: Line chart showing monthly total spending trend
- Expanded: Spending breakdown by category over time

### 3. Recurring Charges (Subscription Bloat)
**Detection:**
- Leverage `normalized_merchant` column and existing recurring logic
- Compare recurring merchant count and spend quarter-over-quarter
- Criteria: 2+ new recurring merchants OR >20% recurring spend increase

**Examples:**
- "3 new recurring charges detected: Netflix, Spotify Premium, Adobe CC ($47/month total)"
- "Subscription spending up 35% - now $340/month across 12 merchants"

**Visualization:**
- Mini: Bar chart showing count of recurring merchants over time
- Expanded: List of all recurring charges with monthly cost, link to /subscriptions

### 4. Spending Shifts (Category Rebalancing)
**Detection:**
- Compare category distribution (% of total spending) across periods
- Criteria: Category A decreased >10 percentage points while Category B increased >10pp

**Examples:**
- "Grocery spending down 25% while Food & Dining up 40% - shift toward eating out"
- "Transportation dropped $200/month, Entertainment increased $180/month"

**Visualization:**
- Mini: Stacked area chart showing category composition over time
- Expanded: Before/after pie charts comparing category distributions

## Insight Card Design

### Visual Hierarchy
1. **Status indicator** (left border/icon)
   - Red: Concerning trends (spending increases, new recurring)
   - Yellow: Notable changes worth reviewing
   - Green: Favorable trends (spending decreases)
   - Blue: Informational shifts

2. **Headline** (bold, large)
   - Clear statement: "Dining out increased 45% this quarter"
   - Action-oriented language

3. **Key metrics** (medium text)
   - Dollar amounts: "$290 vs $200 last quarter (+$90)"
   - Percentage + absolute change together

4. **Mini visualization** (right/bottom)
   - Sparkline for trends (6-12 data points)
   - Small bar/pie for comparisons
   - Warm peach/coral colors matching existing UI
   - Dark mode: explicit hex colors (not CSS variables)

5. **Expand affordance** (bottom-right)
   - Chevron or "View details"
   - Hover state indicates interactivity

### Expansion Behavior
- Click anywhere on card to expand
- Smooth height transition
- Expanded: full Recharts chart, transaction list, date range selector
- Click again or "Collapse" to close
- Only one card expanded at a time (auto-collapse previous)

## Technical Implementation

### API Endpoint
`GET /api/insights` returns:
```typescript
{
  hero: InsightCard[],           // Top 3-5 scored
  categoryTrends: InsightCard[],
  lifestyleInflation: InsightCard[],
  recurringCharges: InsightCard[],
  spendingShifts: InsightCard[]
}
```

### Database Queries
- Reuse existing transaction queries with date filters
- Comparison periods: current vs previous (month/quarter/year)
- Group by category, merchant, date for aggregations

### Insight Detection Functions
Location: `src/lib/insights/`

- `detection.ts` - Pure insight detection logic
  - `detectCategoryTrends(db)` - Compare category spending
  - `detectLifestyleInflation(db)` - Rolling averages and growth
  - `detectRecurringGrowth(db)` - Merchant count + spend growth
  - `detectSpendingShifts(db)` - Category distribution changes

- `ranking.ts` - Scoring algorithm implementation
- `types.ts` - TypeScript interfaces

### File Structure
```
src/
├── lib/insights/
│   ├── detection.ts
│   ├── ranking.ts
│   └── types.ts
├── app/
│   ├── api/insights/route.ts
│   └── page.tsx (dashboard, replaces redirect)
└── components/insights/
    ├── insight-card.tsx
    ├── insight-hero.tsx
    └── insight-grid.tsx
```

### Testing Strategy
- Unit tests for each detection function (Vitest + `:memory:` DB)
- Test edge cases: no data, single transaction, identical periods
- Mock transaction data covering various scenarios

## Alignment with Existing Patterns
- DB functions take `db: Database.Database` as first param
- Pure detection logic separate from DB queries
- API route uses `getDb()` singleton
- Components follow shadcn/ui patterns
- Dark mode with explicit hex colors for charts
- Recharts for visualizations matching /reports page
