# Expenlytics

A local-first spending analytics app that uses AI to extract transactions from PDF bank statements, categorize spending, and detect recurring charges.

## Features

- **PDF Import** — Upload bank/credit card statements and let Claude extract transactions automatically
- **Smart Categorization** — AI-powered categorization across 24+ spending categories
- **Reports & Charts** — Monthly/quarterly/yearly spending breakdowns, category pie charts, and trend analysis
- **Recurring Charge Detection** — Automatically identifies subscriptions and recurring payments with estimated monthly/yearly costs
- **Merchant Normalization** — Cleans up cryptic transaction codes into readable merchant names (e.g., `AMZN MKTP US*1A2B3C` → `Amazon`)
- **Dark Mode** — Built-in light/dark theme toggle
- **Local-First** — All data stays on your machine in a local SQLite database

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Database:** SQLite via better-sqlite3
- **AI:** Anthropic SDK — Claude Sonnet for PDF extraction, Claude Haiku for merchant normalization
- **Charts:** Recharts
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Setup

```bash
git clone https://github.com/aromasca/expenlytics.git
cd expenlytics
npm install
```

Create a `.env.local` file:

```
ANTHROPIC_API_KEY=your-api-key-here
```

### Run

```bash
npm run dev        # Dev server on http://localhost:3000
npm run build      # Production build
npm start          # Start production server
```

### Test

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## How It Works

1. **Upload** a PDF bank or credit card statement on the Transactions page
2. Claude reads the PDF and **extracts** each transaction with date, merchant, amount, and category
3. Merchant names are **normalized** in the background using a lightweight LLM call
4. View **reports** with spending breakdowns, trends, and top transactions
5. Check the **Subscriptions** page to see detected recurring charges and estimated costs

## Project Structure

```
src/
├── app/(app)/          # Pages: transactions, reports, subscriptions, settings
├── app/api/            # API routes: upload, transactions, categories, reports, recurring
├── components/         # React components (UI, charts, upload)
├── lib/db/             # SQLite schema, connection, and query modules
├── lib/claude/         # AI extraction and merchant normalization
├── lib/recurring.ts    # Recurring charge detection logic
└── __tests__/          # Test suite (mirrors src structure)
data/                   # SQLite DB and uploaded PDFs (gitignored)
```

## License

MIT
