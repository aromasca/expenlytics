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

## Environment
- `ANTHROPIC_API_KEY` — required for PDF extraction (used by `@anthropic-ai/sdk`)
- `data/` directory is auto-created on first upload, but the SQLite DB requires it to exist at startup

## Project Structure
- Path alias: `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- `src/lib/db/` — SQLite connection, schema, query modules (pass `db` instance, no global imports in lib)
- `src/lib/claude/` — Claude API extraction with Zod validation
- `src/app/api/` — Next.js API routes (upload, transactions, categories, documents, reports)
- `src/app/(app)/` — Route group with sidebar layout; pages: transactions, reports, settings
- `src/app/page.tsx` — Redirects to `/transactions`
- `src/components/` — React client components using shadcn/ui
- `src/components/reports/` — Recharts chart components for reports dashboard
- `src/__tests__/` — mirrors src structure
- `data/` — gitignored; SQLite DB and uploaded PDFs

## Conventions
- DB query functions accept `db: Database.Database` as first param (testable with `:memory:`)
- `getDb()` enables WAL mode and foreign_keys pragma
- API routes use `getDb()` singleton from `src/lib/db/index.ts`
- Mock Anthropic SDK with `class MockAnthropic {}` pattern, not `vi.fn().mockImplementation`
- React 19: avoid calling setState synchronously in useEffect; use `.then()` pattern
- better-sqlite3: pass params as array to `.get([...])` and `.all([...])` when using dynamic params; `.run()` uses positional args
- `next.config.ts` has `serverExternalPackages: ['better-sqlite3']`
- API routes: validate query params with allowlists before passing to DB functions (never trust `as` casts for SQL-interpolated values like `sort_by`)
- Recharts: `Tooltip` formatter expects `value: number | undefined`, use `Number(value)` not `(value: number)`
- shadcn/ui components installed: button, card, table, input, select, badge, checkbox, dialog, popover

## SQLite Migrations
- `CREATE TABLE IF NOT EXISTS` doesn't modify existing tables - only creates new ones
- Pattern: base CREATE TABLE (original columns) → PRAGMA table_info to check columns → ALTER TABLE for new columns → CREATE INDEX
- Check existing columns: `db.prepare("PRAGMA table_info(table_name)").all()` returns `Array<{ name: string }>`
- Example: `if (!columnNames.includes('new_col')) { db.exec('ALTER TABLE t ADD COLUMN new_col TYPE') }`
- Restart dev server after schema changes for migrations to apply to existing `data/expenlytics.db`
