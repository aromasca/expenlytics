# Transaction Health: Deduplication & Misclassification Detection

## Problem

Transactions are double-counted across overlapping PDF statements (same charge in bank + credit card statement, or overlapping statement periods). Some transactions are also misclassified (ATM withdrawals as "Salary & Wages"). Current data quality tools are scattered across 6 pages with no unified way to surface and resolve issues.

## Solution

A `transaction_flags` system that auto-detects issues at pipeline time and surfaces them via a "Flagged" filter on the existing Transactions page.

## Schema

```sql
CREATE TABLE transaction_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('duplicate', 'category_mismatch', 'suspicious')),
  details TEXT,              -- JSON context about the issue
  resolution TEXT,           -- NULL = unresolved, 'removed'|'kept'|'fixed'|'dismissed'
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(transaction_id, flag_type)
);
CREATE INDEX idx_transaction_flags_txn ON transaction_flags(transaction_id);
CREATE INDEX idx_transaction_flags_unresolved ON transaction_flags(flag_type, resolution) WHERE resolution IS NULL;
```

### Flag types
- `duplicate` — same transaction in another document. Details: `{ "duplicate_of_id": number, "duplicate_of_doc": number }`
- `category_mismatch` — description doesn't match category. Details: `{ "suggested_category": string | null, "reason": string }`
- `suspicious` — future use (unusually large amounts, etc.)

### Resolutions
- `removed` — excluded from all spending queries
- `kept` — confirmed correct
- `fixed` — category/type was corrected
- `dismissed` — reviewed and ignored

## Detection Logic

### Cross-document duplicates
Match: same `date` + `amount` + `type`, different `document_id`. Flag the transaction from the later-uploaded document (higher document_id).

### Same-document duplicates
Match: same `date` + `amount` within one document, where one is debit and one is credit (both sides of transfer), or same type with different descriptions (double extraction). Flag the credit side for debit/credit pairs; higher id for same-type pairs.

### Category mismatch
Rule-based keyword matching:
- `/\bATM\s*(Withdrawal|W\/D)\b/i` → expected: "ATM Withdrawal"
- Checks (`Check #NNN`) with non-null category → flag as uncertain (checks can't be auto-categorized)

### When detection runs
1. **Pipeline time**: after inserting transactions for a new document
2. **Backfill endpoint**: `POST /api/transactions/detect-duplicates` for existing data
3. Category mismatch rules run alongside duplicate detection

## Query Integration

Extend `VALID_TRANSACTION_FILTER` to exclude removed transactions:

```typescript
export const VALID_TRANSACTION_FILTER =
  "COALESCE(c.exclude_from_totals, 0) = 0 " +
  "AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest')) " +
  "AND NOT EXISTS (SELECT 1 FROM transaction_flags tf WHERE tf.transaction_id = t.id AND tf.resolution = 'removed')"
```

One change propagates to all reports, insights, charts, and summaries.

## UI: Flagged Filter on Transactions Page

The Transactions page gets a filter toggle: `[All] [Flagged (N)]`

**Flagged view:**
- Shows only unresolved flags (resolution IS NULL)
- Each row shows issue badge + inline resolution actions
- Duplicate: "[Remove] [Keep] [Dismiss]" with context about which document
- Category mismatch: "[Fix to: X] [Dismiss]" with suggested category
- Optimistic updates, fire-and-forget API calls

**All view:**
- Normal transactions, removed transactions hidden
- Flagged rows get subtle indicator dot

## API Endpoints

### `GET /api/transactions` (extend)
- Add `flagged=true` query param to filter to unresolved flags
- Response includes flag details when present

### `POST /api/transactions/flags/resolve`
```json
{ "flagId": number, "resolution": "removed" | "kept" | "fixed" | "dismissed" }
```
For `fixed`: also accepts `categoryId` to apply the fix in one call.

### `POST /api/transactions/detect-duplicates`
Backfill endpoint. Scans all transactions, creates flags, returns count.

## Scope exclusions
- No LLM calls for detection (all rule-based)
- No fuzzy date matching (data confirms exact dates sufficient)
- `suspicious` flag type defined in schema but not populated yet
