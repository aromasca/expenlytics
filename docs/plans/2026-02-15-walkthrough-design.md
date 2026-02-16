# First-Time User Walkthrough

## Overview

Step-by-step tooltip walkthrough that guides new users through the app on first visit. Highlights UI elements one at a time with a tooltip/popover. Auto-navigates between pages.

## Trigger & Persistence

- **First visit:** `localStorage.getItem('walkthrough_completed')` is null -> auto-start
- **Completion/skip:** sets `walkthrough_completed = 'true'`
- **Replay:** Settings page "Restart walkthrough" button clears localStorage, navigates to `/insights`

No database changes required.

## Steps

| # | Page | Target (`data-walkthrough`) | Tooltip Position | Copy |
|---|------|-----------------------------|-----------------|------|
| 1 | `/insights` | `sidebar` (nav area) | Right of sidebar | **Welcome to Expenlytics!** This is your dashboard. Let's walk through how to get started. |
| 2 | `/documents` | `upload` (upload area) | Below | **Upload a Statement** — Drop a bank or credit card PDF here. We'll extract and categorize every transaction automatically. |
| 3 | `/transactions` | `transactions` (table) | Above | **Review Transactions** — All extracted transactions appear here. You can edit categories, types, and merchant names. |
| 4 | `/reports` | `reports` (charts area) | Above | **Explore Reports** — See spending breakdowns, savings rate, month-over-month comparisons, and a Sankey flow diagram. |
| 5 | `/insights` | `health-score` (card) | Below | **Get Insights** — Your financial health score, spending patterns, and personalized recommendations live here. |

Each step has Back/Next buttons (step 1: Next only, step 5: "Done"). Skip link on every step.

## Visual Mechanics

- **Overlay:** Semi-transparent backdrop (`bg-black/50`) covering viewport
- **Highlight cutout:** `box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)` on a positioned element matching target bounds
- **Target elevation:** Target element gets `relative z-50` + `ring-2 ring-primary`
- **Tooltip:** Absolutely positioned Card with title, description, step counter ("2 of 5"), nav buttons. Positioned via `getBoundingClientRect()` on target element
- **Page transitions:** `router.push()` + short delay for render before positioning tooltip
- **Repositioning:** `ResizeObserver` / scroll listener to handle layout shifts

## Component Architecture

### New files (2)

**`src/components/walkthrough-provider.tsx`** — React context provider
- State: `currentStep: number | null` (null = inactive)
- Methods: `startWalkthrough()`, `nextStep()`, `prevStep()`, `skipWalkthrough()`
- Reads/writes localStorage
- Auto-starts on mount if not completed

**`src/components/walkthrough-overlay.tsx`** — Rendered when `currentStep !== null`
- Backdrop overlay
- Finds target via `document.querySelector('[data-walkthrough="..."]')`
- Computes tooltip position from `getBoundingClientRect()`
- Renders tooltip card with copy, counter, nav buttons
- Handles `router.push()` for page transitions
- ResizeObserver for repositioning

### Modified files (~7)

- `src/app/(app)/layout.tsx` — Wrap children with `WalkthroughProvider`
- `src/components/sidebar.tsx` — Add `data-walkthrough="sidebar"` to nav
- Documents page — Add `data-walkthrough="upload"` to upload area
- Transactions page — Add `data-walkthrough="transactions"` to table
- Reports page — Add `data-walkthrough="reports"` to charts container
- Insights page — Add `data-walkthrough="health-score"` to health score card
- Settings page — Add "Restart walkthrough" button row
