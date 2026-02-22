# Frontend Modernization Design

## Problem

The frontend has grown to 39 components and 8 page files with no shared abstractions. Similar patterns (fetch + loading/error state, sorting, selection, date pickers) are copy-pasted across pages and diverge over time. When one gets updated, others silently break. There are zero frontend tests.

Root causes:
- 60+ inline type definitions — `Category` defined 4x, `Transaction` 3x, `DocumentRow` 2x
- 22+ raw `fetch()` calls each managing their own loading/error/cancellation state
- 3 different cancellation approaches (boolean flag, AbortController, none)
- Sorting icon helper reimplemented identically 4 times
- Date range picker duplicated in commitments and reports
- Page files up to 675 LOC mixing data fetching, state, and rendering

## Approach: Bottom-Up (Types → Hooks → Components → Decomposition → Tests)

Each step is independently valuable and shippable. Types-first means regressions become compile errors instead of runtime surprises.

## Section 1: Shared API Types

`src/types/` with one file per domain:

- `transactions.ts` — Transaction, FlaggedTransaction, TransactionClass
- `categories.ts` — Category
- `documents.ts` — DocumentRow
- `merchants.ts` — MerchantInfo, MergeSuggestion, DescriptionGroup, MerchantTransaction
- `commitments.ts` — CommitmentGroup, CommitmentData, EndedCommitmentGroup, Frequency
- `accounts.ts` — AccountData, UnassignedDoc
- `reports.ts` — ReportData (full nested shape)
- `insights.ts` — re-export from lib/insights/types.ts
- `settings.ts` — ProviderConfig
- `common.ts` — SortOrder, Pagination shared primitives

Both API routes and components import from here. Change a type once → compiler catches all consumers.

## Section 2: TanStack Query Hooks

`src/hooks/` with one file per domain:

- `query-provider.tsx` — QueryClientProvider wrapper
- `use-transactions.ts` — useTransactions(filters), useFlaggedTransactions(), useFlagCount()
- `use-merchants.ts` — useMerchants(params), useMerchantGroups(merchant), useMergeSuggestions()
- `use-commitments.ts` — useCommitments(params) + mutations (status, merge, override, normalize)
- `use-documents.ts` — useDocuments(sort) with refetchInterval for processing status
- `use-accounts.ts` — useAccounts(), useDetectAccounts()
- `use-reports.ts` — useReports(params)
- `use-insights.ts` — useInsights() with polling for generation
- `use-categories.ts` — useCategories() (fetched in 4 places today, cached once)
- `use-settings.ts` — useSettings() + mutations

Eliminates: all useState for loading/error/data, all cancellation logic, duplicate category fetches, manual polling. Mutations use useMutation with onMutate/onError/onSettled for standardized optimistic updates.

## Section 3: Shared UI Components

`src/components/shared/`:

- `sortable-header.tsx` — replaces 4 identical sortIcon() helpers
- `selection-bar.tsx` — replaces 3 sticky bar implementations
- `date-range-picker.tsx` — replaces duplicate date range UI in commitments + reports

No generic "uber-table" — the tables differ enough that abstracting them would be worse than the duplication.

## Section 4: Page File Decomposition

After hooks absorb data fetching and shared components absorb repeated UI, break large pages:

**merchants/** (~675 → ~80 LOC page):
- `merchant-table.tsx` — table + sort/selection
- `merchant-merge.tsx` — merge dialog + preview
- `merchant-expand.tsx` — nested description groups + transaction expansion

**commitments/** (~661 → ~80 LOC page):
- `commitment-filters.tsx` — date range + status tabs
- `commitment-actions.tsx` — bulk action bar

**insights/** (~578 → ~80 LOC page):
- `insights-carousel.tsx` — paginated card display + dismiss
- `insights-header.tsx` — health score + income/outflow summary

Other pages (transactions, documents, accounts, reports, settings) are either already reasonable or don't justify splitting.

## Section 5: Frontend Tests

After refactoring, test the shared layers where breakage concentrates:

**Hook tests** (`src/__tests__/hooks/`):
- use-transactions, use-commitments, use-categories, use-documents
- Mock fetch, verify query keys, cache behavior, optimistic update rollback

**Component tests** (`src/__tests__/components/`):
- sortable-header, selection-bar, date-range-picker
- Rendering + interaction via @testing-library/react

Testing approach: hooks with TanStack Query test utilities, components with @testing-library/react. No page-level integration tests, no snapshots, no E2E (separate initiative).
