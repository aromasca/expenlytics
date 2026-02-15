# Expenlytics

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- SQLite via better-sqlite3, Anthropic SDK, Zod v4, Recharts
- Vitest for testing

## Commands
- `npm test` — run all tests (vitest)
- `npm run test:watch` — run tests in watch mode
- `npm run test -- src/__tests__/lib/db/transactions.test.ts` — run a single test file
- `npm run lint` — eslint
- `npm run build` — production build
- `npm run dev` — dev server on localhost:3000
- `npm start` — start production server
- `git reset --soft <commit>` — squash multiple commits into one (combine with `git commit` to create unified commit)

## Environment
- `ANTHROPIC_API_KEY` — required for PDF extraction (used by `@anthropic-ai/sdk`)
- `data/` directory is auto-created on first upload, but the SQLite DB requires it to exist at startup

## Project Structure
- Path alias: `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- `src/lib/db/` — SQLite connection, schema, query modules (pass `db` instance, no global imports in lib)
- `src/lib/claude/` — Claude API extraction with Zod validation
- `src/app/api/` — Next.js API routes (upload, transactions, transactions/backfill-class, categories, documents, documents/[id], documents/[id]/reprocess, documents/[id]/retry, reports, recurring, reclassify/backfill, settings)
- `src/app/(app)/` — Route group with sidebar layout; pages: insights, transactions, documents, reports, subscriptions, settings
- `src/app/page.tsx` — Redirects to `/insights`
- `src/components/` — React client components using shadcn/ui
- `src/components/reports/` — Recharts chart components + d3-sankey Sankey diagram for reports dashboard
- `src/components/reports/sankey-chart.tsx` — d3-sankey Sankey diagram (Income → Category Groups → Categories + Savings)
- `src/lib/db/reports.ts` — `getSankeyData` (debits) + `getSankeyIncomeData` (credits excl. Transfer/Refund)
- `src/lib/claude/normalize-merchants.ts` — LLM merchant normalization (Claude Haiku)
- `src/lib/claude/extract-transactions.ts` — `extractRawTransactions` (no categories), `classifyTransactions` (index-based), `extractTransactions` (legacy combined), `reclassifyTransactions` (ID-based). All classification prompts include TRANSFER IDENTIFICATION rules for debit-side transfers (CC payments, savings contributions, 401k, P2P self-transfers)
- `src/lib/pipeline.ts` — Background document processing pipeline (extraction → classification → normalization)
- `src/lib/recurring.ts` — Pure recurring charge detection logic (no DB dependency)
- `src/lib/db/recurring.ts` — DB query layer for recurring charges
- `src/lib/insights/compact-data.ts` — SQL-based data compaction for LLM context (`buildCompactData`)
- `src/lib/insights/types.ts` — Types for health assessment, patterns, deep insights, monthly flow
- `src/lib/claude/analyze-finances.ts` — Haiku-powered health score, patterns, deep insights (two LLM calls, ~$0.03/analysis)
- `src/lib/claude/models.ts` — `AVAILABLE_MODELS`, `MODEL_TASKS` config, `getModelForTask(db, task)` for per-task model selection
- `src/lib/db/settings.ts` — `getSetting`, `setSetting`, `getAllSettings` for key-value settings table
- `src/lib/db/health.ts` — `getMonthlyIncomeVsSpending` for income/outflow chart
- `src/components/insights/` — Dashboard UI: health score, pattern grid, income/outflow chart, deep insight cards
- `src/__tests__/` — mirrors src structure
- `data/` — gitignored; SQLite DB and uploaded PDFs

## Conventions
- DB query functions accept `db: Database.Database` as first param (testable with `:memory:`)
- `getDb()` enables WAL mode and foreign_keys pragma
- API routes use `getDb()` singleton from `src/lib/db/index.ts`
- Mock Anthropic SDK with `class MockAnthropic {}` pattern, not `vi.fn().mockImplementation`. To spy on mock calls, extract `vi.fn()` to a module-level variable (per-instance spies are not shared)
- React 19: avoid calling setState synchronously in useEffect; use `.then()` pattern
- better-sqlite3: pass params as array to `.get([...])` and `.all([...])` when using dynamic params; `.run()` uses positional args
- `next.config.ts` has `serverExternalPackages: ['better-sqlite3']`
- Bash/zsh: quote paths containing parentheses, e.g. `"src/app/(app)/..."` — zsh treats `()` as glob
- `exclude_from_totals` column on `categories` table: Transfer, Refund, Savings, Investments are flagged. Use `COALESCE(c.exclude_from_totals, 0) = 0` in all summary/chart/insight queries instead of hardcoding category names
- `transaction_class` column on `transactions` table: structural classification (purchase, payment, refund, fee, interest, transfer). Extracted during raw extraction phase. Belt-and-suspenders filtering: all summary queries use BOTH `exclude_from_totals` AND `(t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))`. The `IS NULL` clause preserves backward compatibility for un-backfilled rows. Backfill endpoint: POST /api/transactions/backfill-class
- Dynamic WHERE extension pattern: `${where}${where ? ' AND' : ' WHERE'} <condition>` when appending to `buildWhere()` output
- API routes: validate query params with allowlists before passing to DB functions (never trust `as` casts for SQL-interpolated values like `sort_by`)
- Optional LLM calls (normalization, etc.) should be wrapped in try/catch so failures don't block core operations
- Always add `.catch()` to fetch promise chains in React to prevent stuck loading states
- Use `null` (not fallback values) for un-populated columns so backfill endpoints can find rows via `IS NULL`
- Recharts: `Tooltip` formatter expects `value: number | undefined`, use `Number(value)` not `(value: number)`
- Recharts: CSS variables don't render in SVG - use explicit hex colors for `stroke`, `fill`, `tick={{ fill }}`, `labelStyle`, `itemStyle`
- Recharts: Disable gray hover cursor with `cursor={false}` on Tooltip component
- Dark mode: Add `suppressHydrationWarning` to `<html>` when using blocking scripts to prevent hydration errors
- ThemeProvider: Avoid returning `null` during SSR - causes hydration mismatches; render children immediately
- Categories: 71 entries across 15 groups; `category_group` column on categories table for UI grouping
- `VALID_CATEGORIES` in `schemas.ts` and `SEED_CATEGORIES` in `schema.ts` must stay in sync
- shadcn/ui Select supports `SelectGroup` and `SelectLabel` for grouped dropdowns
- shadcn/ui components installed: button, card, table, input, select, badge, checkbox, dialog, popover, switch, command
- Category picker uses Popover + Command (cmdk) combobox pattern, not Radix Select
- Custom SVG charts: use `useRef` + relative container div for hover tooltips (not native `<title>`); `pointer-events: none` on text labels
- d3-sankey + d3-shape for custom Sankey diagram (not Recharts)
- Upload route is non-blocking: saves file, fires `processDocument()` in background, returns immediately
- Processing pipeline phases: `upload` → `extraction` → `classification` → `normalization` → `complete` (tracked via `processing_phase` column on documents)
- Raw extraction data (PDF → transactions without categories) stored as JSON in `documents.raw_extraction` — immutable once extracted
- `extractRawTransactions` for extraction-only (Sonnet), `classifyTransactions` for classification-only (Sonnet) — separate LLM calls
- Reprocess = re-run classification + normalization from existing DB transactions (not re-extraction). Retry = full pipeline from PDF.
- When mocking multiple `@/lib/*` modules in tests, use module-level `vi.fn()` variables with `vi.mock()` factory functions (not class-based mocks)
- Mock `fs/promises` with `vi.mock('fs/promises', ...)` when testing pipeline code (PDF files don't exist in test)
- `insight_cache` table stores arbitrary JSON via stringify/parse — use `as unknown as` casts when changing cached data shape
- LLM functions accept optional `model` param with defaults — callers use `getModelForTask(db, task)` to read user-configured model from `settings` table
- `settings` table: key-value store with `INSERT ... ON CONFLICT DO UPDATE` upsert pattern
- TypeScript: `new Set(arr)` from `as const` arrays infers narrow literal types — use `new Set<string>(...)` when checking `string` args with `.has()`

## Design System
- Aesthetic: minimal, data-dense dashboard (neutral monochrome, not warm/coral)
- Color palette: near-black/near-white with zinc grays; emerald for income/credits; no color for debits
- Recharts theme colors: derive from `isDark` toggle — light: text `#737373`, grid `#E5E5E5`, bars `#0A0A0A`; dark: text `#A1A1AA`, grid `#27272A`, bars `#FAFAFA`
- Charts: `axisLine={false} tickLine={false} vertical={false}` on CartesianGrid for clean look; height 240px standard
- Spacing: `p-4 space-y-4` for pages, `p-3` for cards, `py-1.5` for table rows
- Typography: text-xs for data, text-[11px] for labels/counters, `tabular-nums` on all financial figures
- Buttons: `variant="ghost"` + `h-7 text-xs text-muted-foreground` for secondary actions
- Page headers: `text-lg font-semibold` (not text-2xl font-bold)
- Sidebar: w-48 desktop, w-12 mobile; text-[13px] nav items

## SQLite Migrations
- `CREATE TABLE IF NOT EXISTS` doesn't modify existing tables - only creates new ones
- Pattern: base CREATE TABLE (original columns) → PRAGMA table_info to check columns → ALTER TABLE for new columns → CREATE INDEX
- Check existing columns: `db.prepare("PRAGMA table_info(table_name)").all()` returns `Array<{ name: string }>`
- Example: `if (!columnNames.includes('new_col')) { db.exec('ALTER TABLE t ADD COLUMN new_col TYPE') }`
- New seed data: unconditional `INSERT OR IGNORE` pass at end of `initializeSchema` handles newly added categories on existing DBs
- Restart dev server after schema changes for migrations to apply to existing `data/expenlytics.db`
- `.worktrees/` is excluded in `vitest.config.ts` — stale worktree test copies cause false failures
- SQLite: prefer `strftime('%Y-%m', t.date)` grouping over `date('now', '-1 month', 'start of month')` boundaries — the latter breaks in tests where data uses computed dates
- SQLite: never `GROUP BY alias` when the alias is a computed expression (e.g., `COALESCE(a, b) as name` then `GROUP BY name`) — SQLite may resolve the alias non-deterministically, producing wrong group labels. Always `GROUP BY` the full expression instead.
