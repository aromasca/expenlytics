# Navigation, Transactions Management & Reports Dashboard

## Overview

Add sidebar navigation with three tabs: Transactions (browse, filter, delete), Reports (full dashboard with charts), and Settings (stub). Moves from a single-page layout to URL-based routing with shared sidebar.

## Navigation & Routing

- Sidebar on the left with icon + label links
- Routes: `/transactions` (default), `/reports`, `/settings`
- Root `/` redirects to `/transactions`
- Shared layout via Next.js route group `(app)/layout.tsx`
- Active tab highlighted using `usePathname()`
- Sidebar collapses to icons on small screens

## Transactions Tab (`/transactions`)

### Upload Zone
- Existing `UploadZone` component at the top, unchanged

### Filter Bar
- Date range picker: presets (last 30 days, this month, last 3 months, this year, all time) + custom start/end
- Category multi-select dropdown
- Type toggle: All / Debits / Credits
- Source document dropdown
- Search text input
- "Clear filters" button when any filter is active

### Transaction Table
- Checkbox column for multi-select (header checkbox for select-all)
- Columns: Date, Description, Amount, Type, Category (inline edit as today)
- Bulk action bar on selection: count + "Delete selected" with confirmation
- Single-row delete: trash icon on hover with confirmation
- Pagination controls at the bottom (limit/offset already supported by API)

### Editing Capabilities
- Category editing (existing)
- Single and bulk delete (new)
- All other fields are read-only

## Reports Tab (`/reports`)

### Filter Controls
- Date range: This Month, Last Month, This Quarter, This Year, Last 12 Months, Custom
- Category multi-select
- Type filter: All / Debits / Credits
- Source document filter

### Summary Cards (row of 4)
- Total Spent: sum of debits in period
- Total Income: sum of credits in period
- Avg Monthly Spend: total debits / months in range
- Top Category: highest-spend category in period

### Charts (2-column grid + full-width)
- **Spending Over Time (Bar Chart)**: monthly/quarterly bars, top categories stacked/grouped
- **Category Breakdown (Donut Chart)**: proportional spend by category, top 8 + "Other"
- **Spending Trend (Line Chart)**: full-width, monthly data points, optional income overlay
- **Top Transactions Table**: compact top-10 largest transactions in period

### Data
- All aggregation done server-side via `GET /api/reports`
- Returns pre-computed summary, time series, category breakdown, trend, and top transactions

## Settings Tab (`/settings`) — Stub
- Placeholder page with "Coming soon" message
- Greyed-out sections: Category Management, Preferences
- No functionality this cycle

## New API Endpoints

### `DELETE /api/transactions/[id]`
- Delete a single transaction by ID
- Returns 204 on success

### `DELETE /api/transactions` (bulk)
- Body: `{ ids: number[] }`
- Deletes all transactions with matching IDs
- Returns `{ deleted: number }`

### `GET /api/reports`
- Query params: `start_date`, `end_date`, `category_ids`, `type`, `document_id`, `group_by` (month/quarter/year)
- Response:
  ```json
  {
    "summary": { "totalSpent": 0, "totalIncome": 0, "avgMonthly": 0, "topCategory": { "name": "", "amount": 0 } },
    "spendingOverTime": [{ "period": "2026-01", "amount": 0 }],
    "categoryBreakdown": [{ "category": "", "color": "", "amount": 0, "percentage": 0 }],
    "trend": [{ "period": "2026-01", "debits": 0, "credits": 0 }],
    "topTransactions": [{ "id": 0, "date": "", "description": "", "amount": 0, "category": "" }]
  }
  ```

## New DB Functions

### `src/lib/db/transactions.ts`
- `deleteTransaction(db, id)` — delete single transaction
- `deleteTransactions(db, ids)` — bulk delete transactions

### `src/lib/db/reports.ts` (new file)
- `getSpendingSummary(db, filters)` — totals, averages, top category
- `getSpendingOverTime(db, filters, groupBy)` — time-bucketed amounts
- `getCategoryBreakdown(db, filters)` — per-category totals and percentages
- `getSpendingTrend(db, filters)` — monthly debits/credits over time
- `getTopTransactions(db, filters, limit)` — largest transactions

## File Structure

```
src/
  app/
    page.tsx                            # Redirect to /transactions
    (app)/
      layout.tsx                        # Shared sidebar layout
      transactions/page.tsx             # Transactions tab
      reports/page.tsx                  # Reports tab
      settings/page.tsx                 # Settings stub
  components/
    sidebar.tsx                         # Sidebar nav
    filter-bar.tsx                      # Shared filter controls
    transaction-table.tsx               # Enhanced with checkboxes, delete, pagination
    upload-zone.tsx                     # Existing, unchanged
    bulk-action-bar.tsx                 # Multi-select actions
    confirm-dialog.tsx                  # Reusable confirmation modal
    reports/
      summary-cards.tsx                 # 4 stat cards
      spending-bar-chart.tsx            # Recharts bar chart
      category-pie-chart.tsx            # Recharts donut chart
      spending-trend-chart.tsx          # Recharts line chart
      top-transactions-table.tsx        # Compact top-10 table
  app/api/
    transactions/route.ts              # Add DELETE handler
    transactions/[id]/route.ts         # Add DELETE handler
    reports/route.ts                   # New aggregation endpoint
  lib/db/
    transactions.ts                    # Add delete functions
    reports.ts                         # New aggregation queries
```

## Dependencies
- `recharts` — charting library for Reports tab

## Existing Components Reused
- shadcn/ui: button, card, table, input, select, badge
- New shadcn/ui needed: checkbox, dialog
