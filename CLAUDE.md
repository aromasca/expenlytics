# Expenlytics

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- SQLite via better-sqlite3, Anthropic SDK, Zod v4
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
- `src/app/api/` — Next.js API routes (upload, transactions, categories)
- `src/components/` — React client components using shadcn/ui
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
