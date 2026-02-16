# Recurring Page Redesign

## Goal

Redesign the recurring charges page around subscription lifecycle status, with improved detection accuracy, drill-down details, and visual polish.

## Data Model

### New `subscription_status` table (replaces `dismissed_subscriptions`)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PK | Auto-increment |
| `normalized_merchant` | TEXT UNIQUE NOT NULL | Merchant identifier |
| `status` | TEXT NOT NULL | `active`, `ended`, `not_recurring` |
| `status_changed_at` | TEXT | When user changed status |
| `notes` | TEXT | Optional user note |

### Migration

- Migrate existing `dismissed_subscriptions` rows to `subscription_status` with `status = 'not_recurring'`
- Drop `dismissed_subscriptions` after migration

### Detection behavior by status

- **`not_recurring`**: Permanently excluded from `detectRecurringGroups` results
- **`ended`**: Still detected but placed in "Ended" section; new charges after `status_changed_at` flagged as `unexpected_activity: true`
- **`active`** or no status: Normal active detection

## Page Layout

### Top: Spending Trend Chart

- Recharts area chart showing total monthly recurring spend over time
- Uses the same date range filter as the table
- Matches existing report chart aesthetic (hex colors, no CSS vars in SVG)

### Summary Cards (3-column grid)

- **Active**: count + monthly total
- **Ended**: count + "was costing"/mo (historical)
- **Excluded**: count of "not recurring" merchants

### Main Content: Status Sections

**1. Active Subscriptions** (default expanded)
- Grouped by category with collapsible groups and subtotals
- Columns: merchant, frequency badge, avg amount, monthly estimate, occurrences, last date
- Row actions: Mark Ended, Mark Not Recurring
- Expandable row on click: transaction history + cost trend sparkline
- Bulk select + merge kept from current design

**2. Ended Subscriptions** (collapsed by default)
- Same table format with "ended on" date and "was costing" column
- Unexpected activity rows highlighted with warning badge
- Row actions: Reactivate, Mark Not Recurring

**3. Excluded Merchants** (collapsed by default)
- Simple list: merchant name + exclusion date
- Row action: Restore (moves back to active detection)

### Kept from current design

- Date range presets (12mo, YTD, All)
- Sortable column headers
- Bulk select + merge
- Re-analyze (LLM normalization) button

## Expandable Row Detail

- **Left**: Transaction history table (date, description, amount) — scrollable, most recent first
- **Right**: Cost trend sparkline (line chart with average reference line)
- Full table width, indented, `bg-muted/30` background

## Detection Accuracy Improvements

- Raise minimum occurrences from 2 to 3
- Tighten CV threshold from 30% to 25%
- Exclude categories with `exclude_from_totals` from recurring detection
- `not_recurring` merchants permanently filtered before detection runs

## API Changes

### `GET /api/recurring` — Enhanced response

```json
{
  "activeGroups": [],
  "endedGroups": [],
  "excludedMerchants": [],
  "summary": {
    "activeCount": 0,
    "activeMonthly": 0,
    "endedCount": 0,
    "endedWasMonthly": 0,
    "excludedCount": 0
  },
  "trendData": [
    { "month": "2025-03", "amount": 220.50 }
  ]
}
```

### `POST /api/recurring/status` — New route

- Body: `{ merchant: string, status: "active" | "ended" | "not_recurring", notes?: string }`
- Updates or inserts into `subscription_status`
- `status: "active"` effectively restores/reactivates

### Deprecated

- `/api/recurring/dismiss` — absorbed by `/api/recurring/status`

### Unchanged

- `/api/recurring/merge` — update to also handle `subscription_status` entries for merged merchants
- `/api/recurring/normalize` — no changes
