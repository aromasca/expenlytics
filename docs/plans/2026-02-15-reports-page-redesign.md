# Reports Page Redesign

**Date:** 2026-02-15

## Overview

Comprehensive improvement of the reports page addressing readability, dark mode issues, number formatting, and adding new analytical modules. Also includes app-wide number formatting standardization.

## 1. Number Formatting (App-Wide)

Create shared utility `src/lib/format.ts`:
- `formatCurrency(amount)` → `$100,123` (no decimals, for summaries/charts/axes)
- `formatCurrencyPrecise(amount)` → `$1,234.56` (2 decimals, for transaction-level display)
- Both use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` with appropriate `maximumFractionDigits`

Replace all inline `.toFixed(2)` and `` `$${v}` `` formatters across:
- SummaryCards, CategoryPieChart, SpendingBarChart, SpendingTrendChart, TopTransactionsTable, SankeyChart
- Insights components, transactions page, subscriptions page

## 2. Category Breakdown (Pie Chart) Fixes

- **Legend overlap**: Move legend below chart with `<Legend verticalAlign="bottom"` and `wrapperStyle` positioning under the donut
- **Dark mode tooltip**: Add explicit `itemStyle={{ color: textColor }}` and `labelStyle={{ color: textColor }}` using theme-aware hex colors
- **Slice labels**: Show percentage labels only on slices > 5%, hide on smaller ones to reduce clutter

## 3. Date Picker Dark Mode Fix + Preset Buttons

- **Calendar icon**: Add `dark:[color-scheme:dark]` CSS on `<Input type="date">` so browser renders native controls in dark mode
- **Preset buttons**: Replace current set ("This month", "Last month", "Q", "YTD", "12mo", "All") with: **1mo**, **3mo**, **6mo**, **1yr**, **All**. Each sets `from` date relative to today.

## 4. Sankey Drill-Down

- **Default view**: Income → Category Groups only (~8-12 nodes). Clean, readable labels on every node with amounts.
- **Click to expand**: Clicking a group node re-renders the Sankey showing that group exploded into its subcategories. All other groups stay collapsed. Visual indicator (subtle arrow or highlight) on hoverable group nodes.
- **Click to collapse**: Clicking the expanded group header collapses it back.
- **Links**: Fewer nodes at group level means proportionally thicker, more readable link widths. Expanded subcategories inherit the group's proportional space.
- **Tooltip**: Hover tooltip showing flow amount, formatted with `formatCurrency`.

## 5. Savings Rate Chart (New)

- Placed side-by-side with Spending Trend
- Line chart: `(income - spending) / income * 100` as percentage per period
- Single line with area fill — emerald when positive (saving), rose when negative (overspending)
- Y-axis: percentage with `%` suffix
- Computed from existing trend data (debits/credits per period already available from spending trend query)

## 6. Month-over-Month Comparison (New)

- Horizontal bar chart showing category group deltas vs previous period
- Each bar = `currentPeriod - previousPeriod` for that group
- Green bars = spending decreased, rose bars = spending increased
- Sorted by absolute magnitude (biggest changes first)
- Label: group name + delta amount + percentage change
- Data: compare the two most recent complete periods in the selected range

## 7. Top Transactions Fix

- Add WHERE filter: exclude rows where `transaction_class IN ('transfer', 'refund', 'payment')` OR category has `exclude_from_totals = 1`
- Surfaces actual large purchases instead of internal money movements

## Revised Page Layout

1. Summary Cards (4 cards, formatted numbers)
2. Spending Over Time + Category Breakdown (side by side)
3. Money Flow (Sankey with group-level default + click-to-expand)
4. Spending Trend + Savings Rate (side by side)
5. Month-over-Month Comparison (new)
6. Top Transactions (filtered)

## Files to Modify

- `src/lib/format.ts` (new) — shared currency formatting
- `src/components/reports/summary-cards.tsx` — use formatCurrency
- `src/components/reports/category-pie-chart.tsx` — legend, tooltip, label fixes
- `src/components/reports/spending-bar-chart.tsx` — use formatCurrency
- `src/components/reports/spending-trend-chart.tsx` — use formatCurrency
- `src/components/reports/sankey-chart.tsx` — group-level default + drill-down
- `src/components/reports/top-transactions-table.tsx` — use formatCurrencyPrecise
- `src/components/reports/savings-rate-chart.tsx` (new) — savings rate line chart
- `src/components/reports/mom-comparison-chart.tsx` (new) — month-over-month bars
- `src/app/(app)/reports/page.tsx` — date presets, layout, dark mode input fix
- `src/app/api/reports/route.ts` — new data endpoints for MoM + savings rate
- `src/lib/db/reports.ts` — new queries, top transactions filter fix
- All other pages using inline number formatting (transactions, insights, subscriptions)
