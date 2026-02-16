# Expenlytics

A local-first spending analytics app that uses AI to extract transactions from PDF bank statements, categorize spending, detect recurring charges, and surface spending insights — all stored in a local SQLite database.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

### PDF Import & AI Extraction
- Drag-and-drop or browse to upload bank/credit card statement PDFs (multi-file upload supported)
- AI extracts transactions with date, description, amount, type, transaction class, and category
- Local PDF text extraction via pdf-parse with LLM fallback for scanned documents
- Automatic document type detection (credit card, checking, etc.)
- Background processing pipeline: upload → extraction → classification → normalization → complete
- Duplicate file detection via SHA-256 hashing — re-uploading reclassifies with the latest taxonomy
- Transaction-level deduplication across overlapping statements (matches on date + description + amount + type)

### Document Management
- Dedicated documents page showing all uploaded statements with processing status
- Real-time status tracking per document (upload, extraction, classification, normalization, complete, error)
- Reprocess documents (re-run classification + normalization from existing data)
- Retry failed documents (full pipeline from PDF)
- Batch reprocess all documents at once

### Smart Categorization
- 71 categories across 15 groups (Food & Drink, Transportation, Housing, Shopping, Health & Wellness, Entertainment, Travel, Financial, and more)
- AI-powered classification during upload — supports both Anthropic (Claude) and OpenAI (GPT) models
- Inline category editing with a searchable combobox (type-to-search, grouped by category)
- Manual overrides are preserved — AI reclassification never touches manually categorized transactions
- Bulk reclassify all transactions against the latest taxonomy from Settings

### Merchant Classification Memory
- Learns merchant → category mappings from your data (manual edits, AI classifications, majority vote)
- Known merchants skip LLM classification entirely — faster uploads, lower API costs
- Manual category overrides on a transaction automatically update the merchant mapping and propagate globally
- Auto-backfills from existing transaction data on first run

### Merchant Normalization
- AI normalizes cryptic transaction codes into readable names (e.g., `AMZN MKTP US*1A2B3C` → `Amazon`, `SQ *COFFEE SHOP` → `Coffee Shop`)
- Runs automatically at upload time (non-blocking — failures don't prevent import)
- Re-analyze button on Subscriptions page to re-normalize all merchants

### Transaction Management
- Filterable table with search, type (debit/credit), category multi-select, document, and date range
- Date presets: 30 days, this month, 3 months, year-to-date, all time
- Transaction class tracking (purchase, payment, refund, fee, interest, transfer) for accurate spending totals
- Inline category editing via searchable grouped combobox
- Single and bulk delete with confirmation dialogs
- Checkbox selection with select-all, selection banner, and bulk actions
- CSV export
- Pagination (50 per page)

### Reports & Charts
- **Summary cards**: Total spent, total income, average monthly, top category
- **Spending over time**: Bar chart of debits by period
- **Category breakdown**: Pie chart of spending by category
- **Spending trend**: Line chart comparing debits vs credits over time
- **Money flow (Sankey diagram)**: Custom d3-sankey visualization showing income sources → category groups → individual categories, with a net savings node
- **Top transactions**: Table of the 10 largest transactions
- Date range filters with presets (this month, last month, quarter, YTD, 12 months, all) and grouping (monthly, quarterly, yearly)
- Inter-account transfers, refunds, savings, and investments are automatically excluded from spending totals

### Subscription & Recurring Charge Management
- Groups transactions by normalized merchant (case-insensitive) to detect subscriptions
- Calculates frequency (weekly, monthly, quarterly, semi-annual, yearly, irregular), average amount, and estimated monthly/yearly cost
- Expandable rows showing individual transactions with per-transaction cost trend chart
- **Subscription lifecycle**: Mark merchants as ended or not-recurring; restore with undo
- **Bulk actions**: Select multiple merchants to end, exclude, or merge via sticky bottom bar
- **Transaction exclusion**: Exclude individual transactions from a recurring group (e.g., one-off purchases) with undo
- **Merge**: Select multiple merchants and merge them under a single name
- **Optimistic UI**: Actions apply instantly without page refresh; undo available on pending items
- **Cost trend chart**: Gradient area chart with hero total, month-over-month change, avg/low/high stats
- **Category grouping**: Recurring charges organized by spending category with subtotals
- Summary cards: total recurring count, monthly cost, yearly cost, cost trend over time

### Financial Intelligence
- **Health score**: AI-generated overall financial health assessment (0–100) with income/expense ratio analysis
- **Behavioral patterns**: AI detects spending behaviors, habits, and trends across your transaction history
- **Deep insights**: Narrative analysis of cross-category patterns, unusual spending, hidden costs, and actionable suggestions
- **Income vs outflow chart**: Monthly bar chart comparing income and spending
- Paginated carousel with expandable detail cards and severity badges
- Dismiss individual insights; reset all dismissals
- Cached for 1 hour with manual refresh option

### Multi-Provider LLM Support
- Choose between **Anthropic** (Claude) and **OpenAI** (GPT) models for each AI task
- Per-task model selection: extraction, classification, normalization, insights
- Supported models: Claude Sonnet 4.5, Claude Haiku 4.5, GPT-4o, GPT-4o-mini, GPT-5, GPT-5-mini, GPT-5-nano, GPT-5.2
- Configure provider and model per task from the Settings page

### Dark Mode
- Light/dark theme toggle on Settings page
- Persists to localStorage with a blocking script to prevent flash of wrong theme
- Full support across all charts (explicit hex colors for SVG compatibility)

### Settings
- Dark mode toggle
- Per-task LLM provider and model selection (extraction, classification, normalization, insights)
- Reclassify all transactions button (re-runs AI categorization with latest taxonomy)
- Backfill transaction classes from existing category data
- Reset database (danger zone — deletes all data with two-step confirmation)

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **Database**: SQLite via better-sqlite3
- **AI**: Multi-provider — Anthropic SDK (Claude) + OpenAI SDK (GPT) with per-task model selection
- **PDF Parsing**: pdf-parse for local text extraction, LLM fallback for scanned documents
- **Charts**: Recharts + d3-sankey (custom Sankey diagram)
- **Testing**: Vitest

## Getting Started

You need [Node.js 22+](https://nodejs.org/) and at least one AI provider API key.

```bash
git clone https://github.com/aromasca/expenlytics.git
cd expenlytics
npm install
```

Create a `.env.local` file with your API key(s):

```bash
# Required — at least one provider key is needed
ANTHROPIC_API_KEY=your-anthropic-key-here

# Optional — needed only if you want to use OpenAI models
OPENAI_API_KEY=your-openai-key-here
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Updating After Git Pull

If you pull new changes, install dependencies before starting the dev server:

```bash
git pull
npm install
npm run dev
```

Database schema migrations run automatically on startup — no manual steps needed.

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
  -e OPENAI_API_KEY=your_key_here \
  -v $(pwd)/data:/app/data \
  --rm \
  --name expenlytics \
  aromasca/expenlytics:latest
```

### Persistence and Configuration

- **Data Persistence**: The SQLite database and uploaded PDFs are stored in `/app/data`. Ensure you mount a volume to this path to persist data across container restarts.
- **Permissions**: The container runs as a non-root user (`nextjs` with UID `1001`). If you are mounting a host directory on Linux, you may need to adjust permissions: `chown -R 1001:1001 ./data`.
- **API Keys**: `ANTHROPIC_API_KEY` is required at runtime for AI features. `OPENAI_API_KEY` is optional — only needed if you configure OpenAI models in Settings.
- **Network**: The application listens on port 3000 by default.

### Potential Issues & Troubleshooting

- **SQLite Locking**: Avoid mounting the `data` volume on network file systems (like NFS or SMB/CIFS) as SQLite's WAL (Write-Ahead Logging) mode requires features that these file systems often don't support correctly, leading to "database is locked" errors.
- **Permission Denied**: If the app fails to start or can't save files, it's likely a permission mismatch between the host and the container's `nextjs` user. Ensure the host `data` directory is writable by UID `1001`.
- **Memory Limits**: PDF extraction and AI insight generation can be memory-intensive. Ensure your Docker host/container has at least 1GB of RAM allocated.
- **No Hot Reloading**: The Docker image is a production build. For development with hot-reloading, use the local `npm run dev` workflow instead.
- **Database Migrations**: When updating the image to a newer version, the application will automatically attempt to migrate the SQLite schema on startup. Always back up your `data/expenlytics.db` before major updates.

## Usage

1. **Upload a statement** — Go to Documents or Transactions, drag-and-drop or browse for PDF bank/credit card statements. AI extracts and categorizes transactions in the background.
2. **Review transactions** — Edit categories inline with the searchable combobox. Manual edits are preserved and teach the merchant memory system.
3. **Check subscriptions** — View detected recurring charges grouped by category, manage subscription lifecycle (end/exclude/merge), and track cost trends over time.
4. **View reports** — Explore spending breakdowns with bar charts, pie charts, trend lines, and the Sankey money flow diagram. Adjust date ranges and grouping.
5. **Read insights** — Browse AI-generated financial intelligence: health score, behavioral patterns, and deep spending insights.
6. **Manage settings** — Toggle dark mode, configure AI providers/models per task, reclassify transactions, or reset the database.

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
│   │   ├── upload/           #   PDF upload & background processing
│   │   ├── transactions/     #   CRUD + bulk delete + backfill-class
│   │   ├── categories/       #   Category list
│   │   ├── documents/        #   Document list + [id] + reprocess + retry
│   │   ├── reports/          #   Report data + Sankey queries
│   │   ├── recurring/        #   Detection, normalize, merge, status, exclude
│   │   ├── insights/         #   LLM financial intelligence, dismiss
│   │   ├── settings/         #   App settings (provider/model config)
│   │   ├── merchant-categories/ # Merchant memory backfill + apply
│   │   ├── reclassify/       #   Backfill & per-document reclassify
│   │   └── reset/            #   Database reset
│   ├── (app)/                # Route group with sidebar layout
│   │   ├── insights/         #   Financial intelligence dashboard
│   │   ├── transactions/     #   Transaction list & management
│   │   ├── documents/        #   Document management & processing
│   │   ├── reports/          #   Charts & spending analytics
│   │   ├── subscriptions/    #   Recurring charge detection
│   │   └── settings/         #   Theme, LLM config, reclassify, reset
│   └── page.tsx              # Redirects to /insights
├── components/               # React components (shadcn/ui based)
│   ├── reports/              #   Chart components + Sankey diagram
│   └── insights/             #   Health score, patterns, insight cards
├── lib/
│   ├── db/                   # SQLite schema, connection, query modules
│   ├── llm/                  # Multi-provider LLM abstraction layer
│   │   ├── anthropic/        #   Anthropic (Claude) provider adapter
│   │   ├── openai/           #   OpenAI (GPT) provider adapter
│   │   └── prompts/          #   Provider-specific prompt variants
│   ├── insights/             # Data compaction, types for LLM insights
│   ├── pipeline.ts           # Background document processing pipeline
│   └── recurring.ts          # Recurring charge detection logic
└── __tests__/                # Tests (mirrors src/ structure)
data/                         # SQLite DB & uploaded PDFs (gitignored)
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload` | Upload PDF, start background processing |
| GET | `/api/transactions` | List transactions (filterable, paginated) |
| PATCH | `/api/transactions/[id]` | Update transaction category |
| DELETE | `/api/transactions/[id]` | Delete single transaction |
| DELETE | `/api/transactions` | Bulk delete transactions |
| POST | `/api/transactions/backfill-class` | Backfill transaction classes from categories |
| GET | `/api/categories` | List all 71 categories |
| GET | `/api/documents` | List uploaded documents with status |
| GET | `/api/documents/[id]` | Get single document details |
| POST | `/api/documents/[id]/reprocess` | Reprocess document (classification + normalization) |
| POST | `/api/documents/[id]/retry` | Retry failed document (full pipeline) |
| GET | `/api/reports` | Report data (summary, charts, Sankey) |
| GET | `/api/recurring` | Detect recurring charges |
| POST | `/api/recurring/normalize` | Re-normalize merchant names |
| POST | `/api/recurring/merge` | Merge merchants |
| POST | `/api/recurring/status` | Set subscription status (ended/not_recurring/active) |
| POST | `/api/recurring/exclude` | Exclude/restore individual transaction from recurring |
| GET | `/api/insights` | Generate financial intelligence |
| POST | `/api/insights/dismiss` | Dismiss an insight |
| DELETE | `/api/insights/dismiss` | Clear all dismissed insights |
| GET | `/api/settings` | Get app settings |
| PUT | `/api/settings` | Update app settings |
| POST | `/api/merchant-categories/backfill` | Backfill merchant memory from data |
| POST | `/api/merchant-categories/apply` | Apply merchant memory globally |
| POST | `/api/reclassify/backfill` | Reclassify all transactions |
| POST | `/api/reclassify/[documentId]` | Reclassify by document |
| POST | `/api/reset` | Reset database and delete all data |

## License

MIT
