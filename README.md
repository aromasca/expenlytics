# Expenlytics

A local-first spending analytics app that uses AI to extract transactions from PDF bank statements, categorize spending, detect recurring charges, and surface spending insights.

## Features

- **PDF Import** — Upload bank/credit card statements and let Claude extract transactions automatically
- **Smart Categorization** — AI-powered categorization across 24+ spending categories
- **Reports & Charts** — Monthly/quarterly/yearly spending breakdowns, category pie charts, and trend analysis
- **Recurring Charge Detection** — Automatically identifies subscriptions and recurring payments with estimated monthly/yearly costs
- **Merchant Normalization** — Cleans up cryptic transaction codes into readable merchant names (e.g., `AMZN MKTP US*1A2B3C` → `Amazon`)
- **Spending Insights** — AI-generated observations about spending trends, lifestyle inflation, and category shifts
- **Dark Mode** — Built-in light/dark theme toggle
- **Local-First** — All data stays on your machine in a local SQLite database

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Database:** SQLite via better-sqlite3
- **AI:** Anthropic SDK — Claude Sonnet for PDF extraction & insights, Claude Haiku for merchant normalization
- **Charts:** Recharts
- **Testing:** Vitest

## Getting Started

You need [Node.js 22+](https://nodejs.org/) and an [Anthropic API key](https://console.anthropic.com/) with at least $5 of credits loaded (the minimum top-up on Anthropic's billing page).

```bash
git clone https://github.com/aromasca/expenlytics.git
cd expenlytics
npm install
echo 'ANTHROPIC_API_KEY=your-key-here' > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload a statement** — Go to Transactions and upload a PDF bank or credit card statement
2. **Review transactions** — Claude extracts each transaction with date, merchant, amount, and category. Edit as needed.
3. **View reports** — Charts break down spending by category and over time
4. **Check subscriptions** — See detected recurring charges with monthly/yearly cost estimates
5. **Read insights** — AI-generated observations about your spending patterns

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on http://localhost:3000 |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run build` | Production build |

## Project Structure

```
src/
├── app/
│   ├── api/                # API routes: upload, transactions, categories, reports, recurring, insights
│   ├── (app)/              # Route group with sidebar layout
│   │   ├── insights/       # AI insights dashboard
│   │   ├── transactions/   # Transaction list & management
│   │   ├── reports/        # Charts & spending analytics
│   │   ├── subscriptions/  # Recurring charge detection
│   │   └── settings/       # Categories & preferences
│   └── page.tsx            # Redirects to /insights
├── components/             # React components (shadcn/ui based)
├── lib/
│   ├── db/                 # SQLite schema, connection, query modules
│   ├── claude/             # Claude API integration (extraction, normalization)
│   ├── insights/           # Insight detection, ranking, and types
│   └── recurring.ts        # Recurring charge detection logic
└── __tests__/              # Tests (mirrors src/ structure)
data/                       # SQLite DB & uploaded PDFs (gitignored)
```

## License

MIT
