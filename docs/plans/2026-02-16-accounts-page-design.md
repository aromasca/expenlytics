# Accounts Page Design

## Goal

Auto-detect bank accounts/credit cards from uploaded statements and show a completeness grid so users can tell at a glance which monthly statements are present or missing.

## Database

### New `accounts` table

```sql
accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  institution   TEXT,
  last_four     TEXT,
  type          TEXT NOT NULL,  -- credit_card|checking_account|savings_account|investment|other
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### `documents` table change

Add `account_id INTEGER REFERENCES accounts(id)` column via ALTER TABLE migration.

### Account matching

After LLM extraction, match by `(institution, last_four)`:
- Match found → set `documents.account_id`
- No match → INSERT new account, set FK
- `last_four` null → match by institution + document_type, or create new

## LLM Extraction Changes

Add optional fields to raw extraction schema:

```typescript
account_name: z.string().optional()   // "Chase Sapphire Reserve"
institution: z.string().optional()    // "Chase"
last_four: z.string().optional()      // "4821"
```

Extraction prompt addition: "Extract the account name, financial institution, and last 4 digits of the account number if visible on the statement."

Fields are optional — older documents have `account_id = NULL` until reprocessed.

## Pipeline Integration

After extraction, before classification:
1. Read `account_name`, `institution`, `last_four` from extraction result
2. Query `accounts` table for match on `(institution, last_four)`
3. Match → set `documents.account_id`
4. No match → INSERT new account, set FK
5. Raw values stored in `raw_extraction` JSON as usual

## API Routes

### `GET /api/accounts`

Returns all accounts with completeness data:

```json
[
  {
    "id": 1,
    "name": "Chase Sapphire",
    "institution": "Chase",
    "lastFour": "4821",
    "type": "credit_card",
    "documentCount": 8,
    "months": {
      "2025-06": "complete",
      "2025-07": "complete",
      "2025-08": "missing",
      "2025-09": "complete"
    }
  }
]
```

`months` spans earliest transaction month to current month. Values: `"complete"` (processed document with transactions in that month) or `"missing"`.

### `PATCH /api/accounts/[id]`

Rename account: `{ name: "New Name" }`

### `POST /api/accounts/merge`

Merge accounts: `{ sourceId: 2, targetId: 1 }` — reassign all documents from source to target, delete source.

## UI — Accounts Page

Page at `/accounts`, added to sidebar between Documents and Reports.

### Layout

- Page header: "Accounts" (text-lg font-semibold)
- One card per account:
  - Account name (editable inline), institution, last-four badge, type badge
  - Document count ("8 statements")
  - Completeness grid grouped by year

### Completeness Grid

```
Chase Sapphire ·4821                    8 statements
┌ 2025  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec
         ✓    ✓    ✓    ✓    ✓    ✓    ✗    ✓    ✓    ·    ·    ·
┌ 2026  Jan  Feb
         ✓    ✓
```

- `✓` = complete (emerald) — processed document with transactions in that month
- `✗` = missing (muted red) — no document covering that month
- `·` = future (zinc/muted) — month hasn't occurred yet
- Each year is its own row for compactness
- Hover tooltip: document filename or "Missing"

### Account Management

- **Rename:** Click account name to edit inline
- **Merge:** Select multiple accounts with checkboxes → "Merge" button → pick target account → confirm dialog
- **Unassigned section:** Documents with `account_id = NULL` shown at bottom. Can be reprocessed or manually assigned.

## Decisions

- LLM extraction for account detection (not filename parsing or manual assignment)
- Dedicated `accounts` table (not derived from document metadata)
- Auto-detect time range from data (earliest transaction to current month)
- Grid grouped by year to stay compact over time
- Merge/rename supported from day one
