# Expenlytics

A local-first spending analytics app that uses AI to extract transactions from PDF bank statements, categorize spending, detect recurring charges, and surface spending insights — all stored in a local SQLite database.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

### PDF Import & AI Extraction
- Drag-and-drop or browse to upload bank/credit card statement PDFs
- Claude extracts transactions with date, description, amount, type, and category
- Automatic document type detection (credit card, checking, etc.)
- Duplicate file detection via SHA-256 hashing — re-uploading reclassifies with the latest taxonomy
- Transaction-level deduplication across overlapping statements (matches on date + description + amount + type)

### Smart Categorization
- 71 categories across 16 groups (Food & Drink, Transportation, Housing, Shopping, Health & Wellness, Entertainment, Travel, Financial, and more)
- AI-powered classification using Claude during upload
- Inline category editing with a searchable combobox (type-to-search, grouped by category)
- Manual overrides are preserved — AI reclassification never touches manually categorized transactions
- Bulk reclassify all transactions against the latest taxonomy from Settings

### Merchant Normalization
- Claude Haiku normalizes cryptic transaction codes into readable names (e.g., `AMZN MKTP US*1A2B3C` → `Amazon`, `SQ *COFFEE SHOP` → `Coffee Shop`)
- Runs automatically at upload time (non-blocking — failures don't prevent import)
- Re-analyze button on Subscriptions page to re-normalize all merchants

### Transaction Management
- Filterable table with search, type (debit/credit), category multi-select, document, and date range
- Date presets: 30 days, this month, 3 months, year-to-date, all time
- Inline category editing via searchable grouped combobox
- Single and bulk delete with confirmation dialogs
- Checkbox selection with select-all, selection banner, and bulk actions
- Pagination (50 per page)

### Reports & Charts
- **Summary cards**: Total spent, total income, average monthly, top category
- **Spending over time**: Bar chart of debits by period
- **Category breakdown**: Pie chart of spending by category
- **Spending trend**: Line chart comparing debits vs credits over time
- **Money flow (Sankey diagram)**: Custom d3-sankey visualization showing income sources → category groups → individual categories, with a net savings node
- **Top transactions**: Table of the 10 largest transactions
- Date range filters with presets (this month, last month, quarter, YTD, 12 months, all) and grouping (monthly, quarterly, yearly)

### Recurring Charge Detection
- Groups transactions by normalized merchant to detect subscriptions
- Calculates frequency (weekly, monthly, quarterly, yearly, irregular), average amount, and estimated monthly/yearly cost
- Expandable rows showing individual transactions
- **Merge**: Select multiple merchants and merge them under a single name
- **Dismiss/restore**: Hide merchants you don't consider recurring; restore from the dismissed section
- Summary cards: total recurring count, monthly cost, yearly cost

### AI Spending Insights
- **LLM insights**: Claude Haiku analyzes 6 months of spending data and generates 8–12 observations about cross-category patterns, unusual spending, hidden costs, and actionable suggestions
- **Statistical insights**: Rule-based detection of category trends (>15% and >$50 change), lifestyle inflation (>8% 3-month growth), recurring cost growth, and spending mix shifts
- Paginated carousel (3 per page) with expandable detail cards
- Severity badges: concerning, notable, favorable, informational
- Dismiss individual insights; reset all dismissals
- Cached for 1 hour with manual refresh option

### Dark Mode
- Light/dark theme toggle on Settings page
- Persists to localStorage with a blocking script to prevent flash of wrong theme
- Full support across all charts (explicit hex colors for SVG compatibility)

### Settings
- Dark mode toggle
- Reclassify all transactions button (re-runs AI categorization with latest taxonomy)
- Reset database (danger zone — deletes all data with two-step confirmation)

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Database**: SQLite via better-sqlite3
- **AI**: Anthropic SDK — Claude for PDF extraction & classification, Claude Haiku for merchant normalization & insight generation
- **Charts**: Recharts + d3-sankey (custom Sankey diagram)
- **Testing**: Vitest

## Getting Started

You need [Node.js 22+](https://nodejs.org/) and an [Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/aromasca/expenlytics.git
cd expenlytics
npm install
echo 'ANTHROPIC_API_KEY=your-key-here' > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

You can run Expenlytics as a Docker container.

### Build the Image

```bash
docker build -t aromasca/expenlytics:latest .
```

### Run the Container

```bash
docker run -d \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your_key_here \
  -v $(pwd)/data:/app/data \
  --rm \
  --name expenlytics \
  aromasca/expenlytics:latest
```

### Persistence and Configuration

- **Data Persistence**: The SQLite database and uploaded PDFs are stored in `/app/data`. Ensure you mount a volume to this path to persist data across container restarts.
- **Permissions**: The container runs as a non-root user (`nextjs` with UID `1001`). If you are mounting a host directory on Linux, you may need to adjust permissions: `chown -R 1001:1001 ./data`.
- **API Key**: The `ANTHROPIC_API_KEY` environment variable is required at runtime for AI features (PDF extraction, categorization, insights).
- **Network**: The application listens on port 3000 by default.

### Potential Issues & Troubleshooting

- **SQLite Locking**: Avoid mounting the `data` volume on network file systems (like NFS or SMB/CIFS) as SQLite's WAL (Write-Ahead Logging) mode requires features that these file systems often don't support correctly, leading to "database is locked" errors.
- **Permission Denied**: If the app fails to start or can't save files, it's likely a permission mismatch between the host and the container's `nextjs` user. Ensure the host `data` directory is writable by UID `1001`.
- **Memory Limits**: PDF extraction and AI insight generation can be memory-intensive. Ensure your Docker host/container has at least 1GB of RAM allocated.
- **No Hot Reloading**: The Docker image is a production build. For development with hot-reloading, use the local `npm run dev` workflow instead.
- **Database Migrations**: When updating the image to a newer version, the application will automatically attempt to migrate the SQLite schema on startup. Always back up your `data/expenlytics.db` before major updates.

## Usage

1. **Upload a statement** — Go to Transactions, drag-and-drop or browse for a PDF bank or credit card statement. Claude extracts and categorizes transactions automatically.
2. **Review transactions** — Edit categories inline with the searchable combobox. Manual edits are preserved across reclassifications.
3. **Check subscriptions** — View detected recurring charges, merge duplicate merchants, and dismiss non-recurring items.
4. **View reports** — Explore spending breakdowns with bar charts, pie charts, trend lines, and the Sankey money flow diagram. Adjust date ranges and grouping.
5. **Read insights** — Browse AI-generated and statistical insights about your spending patterns. Dismiss ones you've seen.
6. **Manage settings** — Toggle dark mode, reclassify all transactions with the latest taxonomy, or reset the database.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── app/
│   ├── api/                  # API routes
│   │   ├── upload/           #   PDF upload & extraction
│   │   ├── transactions/     #   CRUD + bulk delete
│   │   ├── categories/       #   Category list
│   │   ├── documents/        #   Uploaded document list
│   │   ├── reports/          #   Report data + Sankey queries
│   │   ├── recurring/        #   Detection, normalize, merge, dismiss
│   │   ├── insights/         #   LLM + statistical insights, dismiss
│   │   ├── reclassify/       #   Backfill & per-document reclassify
│   │   └── reset/            #   Database reset
│   ├── (app)/                # Route group with sidebar layout
│   │   ├── insights/         #   AI insights dashboard
│   │   ├── transactions/     #   Transaction list & management
│   │   ├── reports/          #   Charts & spending analytics
│   │   ├── subscriptions/    #   Recurring charge detection
│   │   └── settings/         #   Theme, reclassify, reset
│   └── page.tsx              # Redirects to /insights
├── components/               # React components (shadcn/ui based)
│   ├── reports/              #   Chart components + Sankey diagram
│   └── insights/             #   Insight cards, carousel, grid
├── lib/
│   ├── db/                   # SQLite schema, connection, query modules
│   ├── claude/               # Claude API: extraction, normalization
│   ├── insights/             # Insight detection, ranking, types
│   └── recurring.ts          # Recurring charge detection logic
└── __tests__/                # Tests (mirrors src/ structure)
data/                         # SQLite DB & uploaded PDFs (gitignored)
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload` | Upload PDF, extract & classify transactions |
| GET | `/api/transactions` | List transactions (filterable, paginated) |
| PATCH | `/api/transactions/[id]` | Update transaction category |
| DELETE | `/api/transactions/[id]` | Delete single transaction |
| DELETE | `/api/transactions` | Bulk delete transactions |
| GET | `/api/categories` | List all 71 categories |
| GET | `/api/documents` | List uploaded documents |
| GET | `/api/reports` | Report data (summary, charts, Sankey) |
| GET | `/api/recurring` | Detect recurring charges |
| POST | `/api/recurring/normalize` | Re-normalize merchant names |
| POST | `/api/recurring/merge` | Merge merchants |
| POST | `/api/recurring/dismiss` | Dismiss a recurring charge |
| DELETE | `/api/recurring/dismiss` | Restore a dismissed charge |
| GET | `/api/insights` | Generate spending insights |
| POST | `/api/insights/dismiss` | Dismiss an insight |
| DELETE | `/api/insights/dismiss` | Clear all dismissed insights |
| POST | `/api/reclassify/backfill` | Reclassify all transactions |
| POST | `/api/reclassify/[documentId]` | Reclassify by document |
| POST | `/api/reset` | Reset database and delete all data |

## License

MIT
