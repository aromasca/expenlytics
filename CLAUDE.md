# Expenlytics

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- SQLite via better-sqlite3, Anthropic SDK, OpenAI SDK, Zod v4, Recharts, d3-sankey
- pdf-parse for local PDF text extraction (LLM fallback for scanned docs)
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
- `ANTHROPIC_API_KEY` — required for Anthropic provider
- `OPENAI_API_KEY` — optional, required when using OpenAI provider
- `data/` directory is auto-created on first upload, but the SQLite DB requires it to exist at startup

## Project Structure
- Path alias: `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- `src/lib/db/` — SQLite connection, schema, query modules (pass `db` instance, no global imports in lib). Key modules: `schema.ts`, `transactions.ts`, `reports.ts`, `commitments.ts`, `categories.ts`, `documents.ts`, `accounts.ts`, `health.ts`, `settings.ts`, `insight-cache.ts`, `merchant-categories.ts`, `merchants.ts`
- `src/lib/llm/` — Multi-provider LLM abstraction. `LLMProvider` interface in `types.ts`, `AnthropicProvider` in `anthropic/provider.ts` + `OpenAIProvider` in `openai/provider.ts`, `getProviderForTask(db, task)` factory in `factory.ts`, provider-specific prompts in `prompts/`, Zod schemas in `schemas.ts`
- `src/lib/llm/extract-transactions.ts` — `extractRawTransactions` (PDF→raw data), `classifyTransactions` (add categories), `reclassifyTransactions`. Classification prompts include TRANSFER IDENTIFICATION rules for debit-side transfers
- `src/lib/llm/analyze-finances.ts` — LLM-powered health score, patterns, deep insights (two LLM calls)
- `src/lib/llm/normalize-merchants.ts` — LLM merchant normalization
- `src/lib/llm/suggest-merges.ts` — LLM-powered merchant duplicate detection
- `src/lib/pipeline.ts` — Background document processing: extraction → classification → normalization → complete
- `src/lib/insights/compact-data.ts` — SQL data compaction for LLM context (`buildCompactData`)
- `src/lib/commitments.ts` — Pure commitment detection logic (no DB dependency). Groups by case-insensitive `normalized_merchant` (picks most common casing). Frequencies: weekly/monthly/quarterly/semi-annual/yearly/irregular. 2 occurrences allowed for 150+ day spans
- `estimateMonthlyAmount`: for frequent charges (weekly/monthly/irregular), uses `totalAmount / max(distinctCalendarMonths, roundedSpanMonths)` — handles both multiple charges per month and billing-date drift. For infrequent charges (quarterly/semi-annual/yearly), amortizes `avgAmount / divisor`
- `src/lib/format.ts` — `formatCurrency()` and `formatCurrencyPrecise()` utilities
- `src/lib/chart-theme.ts` — Shared light/dark chart color constants (`getChartColors()`)
- `src/lib/filters.ts` — `VALID_TRANSACTION_FILTER` constant for query param validation
- `src/lib/date-presets.ts` — Date range preset helpers for filter bar
- `src/app/api/` — API routes: `upload`, `transactions`, `transactions/[id]`, `categories`, `documents`, `documents/[id]`, `documents/[id]/reprocess`, `documents/[id]/retry`, `reports`, `commitments`, `commitments/normalize`, `commitments/status`, `commitments/exclude`, `commitments/merge`, `commitments/override`, `reclassify/[documentId]`, `insights`, `insights/dismiss`, `accounts`, `accounts/[id]`, `accounts/detect`, `accounts/merge`, `accounts/reset`, `merchants`, `merchants/suggest-merges`, `settings`, `reset`
- `src/app/(app)/` — Route group with sidebar layout; pages: insights, transactions, documents, reports, commitments, merchants, accounts, settings
- `src/app/page.tsx` — Redirects to `/insights`
- `src/components/` — React client components using shadcn/ui
- `src/components/reports/` — Recharts charts (spending bar/trend/pie, savings rate, MoM comparison, summary cards, top transactions) + d3-sankey Sankey diagram (`sankey-chart.tsx`)
- `src/components/insights/` — Health score card, income/outflow chart
- `src/__tests__/` — mirrors src structure
- `data/` — gitignored; SQLite DB and uploaded PDFs

## Conventions

### Database
- DB query functions accept `db: Database.Database` as first param (testable with `:memory:`)
- `getDb()` enables WAL mode and foreign_keys pragma; API routes use singleton from `src/lib/db/index.ts`
- better-sqlite3: pass params as array to `.get([...])` and `.all([...])` for dynamic params; `.run()` uses positional args
- `settings` table: key-value store with `INSERT ... ON CONFLICT DO UPDATE` upsert pattern
- `insight_cache` table stores arbitrary JSON via stringify/parse — use `as unknown as` casts when changing cached data shape
- `commitment_status` table: tracks ended/not_recurring merchants (replaces `dismissed_subscriptions`). `setCommitmentStatus` with 'active' deletes the row
- `excluded_commitment_transactions` table: individual transaction IDs excluded from commitment detection
- Use `null` (not fallback values) for un-populated columns so backfill endpoints can find rows via `IS NULL`
- `document_accounts` junction table: many-to-many between documents and accounts (combined statements). Stores `statement_month`/`statement_date` per link
- Account matching: exact `institution + last_four` first, fuzzy `LIKE` substring fallback on institution name for LLM naming inconsistencies

### Query Patterns
- `exclude_from_totals` column on `categories` table: Transfer, Refund, Savings, Investments are flagged. Use `COALESCE(c.exclude_from_totals, 0) = 0` in summary/chart/insight queries instead of hardcoding category names
- `transaction_class` column on `transactions` table: structural classification (purchase, payment, refund, fee, interest, transfer). Belt-and-suspenders: summary queries use BOTH `exclude_from_totals` AND `(t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))`. `IS NULL` for backward compat
- Dynamic WHERE extension: `${where}${where ? ' AND' : ' WHERE'} <condition>` when appending to `buildWhere()` output
- API routes: validate query params with allowlists before passing to DB (never trust `as` casts for SQL-interpolated values)

### LLM
- `getProviderForTask(db, task)` returns `{ provider, providerName, model }` — reads `provider_<task>` and `model_<task>` from settings, defaults to Anthropic. See `src/lib/llm/config.ts` for available models
- LLM functions accept `(provider, providerName, ..., model)` signature
- OpenAI: use `max_completion_tokens` not `max_tokens`; PDF extraction via file upload API (`files.create` + `responses.create`), NOT image conversion
- Zod schemas for LLM output: use `.transform()` with fallback instead of strict `.enum()` — LLMs return unexpected values causing infinite retry loops. Use `z.union([z.array(z.string()), z.string().transform(v => [v])])` for array fields. Same pattern for object-or-array: `z.union([z.array(schema), schema.transform(v => [v])])`
- Optional LLM calls (normalization, etc.) should be wrapped in try/catch so failures don't block core operations

### Pipeline
- Upload route is non-blocking: saves file, fires `processDocument()` in background, returns immediately
- Pipeline phases: `upload` → `extraction` → `classification` → `normalization` → `complete` (tracked via `processing_phase` on documents)
- Two-stage PDF extraction: local `pdf-parse` first, LLM fallback for scanned/image PDFs
- Raw extraction stored as JSON in `documents.raw_extraction` — immutable once extracted
- `extractRawTransactions` for extraction-only, `classifyTransactions` for classification-only — separate LLM calls
- Reprocess = re-run classification + normalization from existing DB transactions. Retry = full pipeline from PDF. Retry clears `raw_extraction` to force re-extraction when schema adds new fields
- Pipeline also runs account detection: extracts `statement_month`/`statement_date` from raw result and calls `assignDocumentToAccount`
- Merchant memory: `merchant_categories` table caches merchant→category mappings. Known merchants skip LLM classification. Manual overrides propagate globally

### Testing
- Test pattern: `new Database(':memory:')` + `initializeSchema(db)`
- NEVER use real merchant names, amounts, or dates from user data in tests — use generic fictional names (e.g. "Acme SaaS") and round amounts
- Mock LLM: `createMockProvider()` returning `{ provider, mockComplete, mockExtract }` — see `src/__tests__/lib/llm/`
- When mocking multiple `@/lib/*` modules, use module-level `vi.fn()` variables with `vi.mock()` factory functions (not class-based mocks)
- Mock `fs/promises` with `vi.mock('fs/promises', ...)` when testing pipeline code
- `.worktrees/` excluded in `vitest.config.ts` to avoid stale test copies

### React & UI
- React 19: avoid calling setState synchronously in useEffect; use `.then()` pattern or `setTimeout(() => setState(...), 0)`
- Always add `.catch()` to fetch promise chains to prevent stuck loading states
- Optimistic updates pattern: track pending changes in local state (e.g. `pendingRemovals` Map), render faded/strikethrough with undo button, fire-and-forget API call, revert state only on error. Avoid `fetchData()` after actions to prevent layout shifts
- `next.config.ts` has `serverExternalPackages: ['better-sqlite3', 'openai', 'pdf-parse']`
- Bash/zsh: quote paths containing parentheses, e.g. `"src/app/(app)/..."` — zsh treats `()` as glob
- Categories: 71 entries across 16 groups; `category_group` column for UI grouping
- `VALID_CATEGORIES` in `schemas.ts` and `SEED_CATEGORIES` in `schema.ts` must stay in sync
- Category picker uses Popover + Command (cmdk) combobox pattern, not Radix Select
- shadcn/ui components installed: button, card, table, input, select, badge, checkbox, dialog, popover, switch, command
- Custom SVG charts (Sankey): use `useRef` + relative container div for hover tooltips; `pointer-events: none` on text labels
- Dark mode: `suppressHydrationWarning` on `<html>`; ThemeProvider must render children immediately (no null during SSR)
- TypeScript: `new Set()` from `as const` arrays narrows to literal union — use `new Set<string>(...)` when `.has()` receives `string`
- Prefer automatic background operations over Settings page buttons for data maintenance

### Recharts Specifics
- CSS variables don't render in SVG — use explicit hex colors for stroke, fill, tick, labelStyle, itemStyle
- Theme: light: text `#737373`, grid `#E5E5E5`, bars `#0A0A0A`; dark: text `#A1A1AA`, grid `#27272A`, bars `#FAFAFA`
- `axisLine={false} tickLine={false} vertical={false}` on CartesianGrid; height 240px
- `Tooltip` formatter: use `Number(value)` not `(value: number)`; `cursor={false}` to disable hover cursor

## Security — Pre-Commit Checks
- Before EVERY commit, review staged files and diffs for sensitive information. This is mandatory and non-negotiable.
- Sensitive information includes but is not limited to: API keys, secrets, tokens, transaction data, PII (names, accounts, addresses), imported financial documents (PDFs, CSVs), and database files.
- Run `git diff --cached` and inspect for anything that should not be committed.
- If uncertain whether something is sensitive, ALWAYS ask the user before committing.
- Known sensitive paths: `data/`, `data-sample/`, `data-backup-*`, `.env*` — these must never be committed.

## Design System
- Aesthetic: minimal, data-dense dashboard (neutral monochrome, not warm/coral)
- Color palette: near-black/near-white with zinc grays; emerald for income/credits; no color for debits
- Spacing: `p-4 space-y-4` for pages, `p-3` for cards, `py-1.5` for table rows
- Typography: text-xs for data, text-[11px] for labels/counters, `tabular-nums` on all financial figures
- Buttons: `variant="ghost"` + `h-7 text-xs text-muted-foreground` for secondary actions
- Page headers: `text-lg font-semibold` (not text-2xl font-bold)
- Sidebar: w-48 desktop, w-12 mobile; text-[13px] nav items

## SQLite Migrations
- `CREATE TABLE IF NOT EXISTS` doesn't modify existing tables — only creates new ones
- Pattern: base CREATE TABLE → `PRAGMA table_info` to check columns → `ALTER TABLE ADD COLUMN` for new columns → `CREATE INDEX`
- Check columns: `db.prepare("PRAGMA table_info(table_name)").all()` returns `Array<{ name: string }>`
- New seed data: unconditional `INSERT OR IGNORE` pass at end of `initializeSchema`
- Restart dev server after schema changes for migrations to apply to existing DB
- Never `GROUP BY alias` on computed expressions — use full expression to avoid non-deterministic labels
- Prefer `strftime('%Y-%m', t.date)` grouping over `date('now', ...)` boundaries — the latter breaks in tests with computed dates
