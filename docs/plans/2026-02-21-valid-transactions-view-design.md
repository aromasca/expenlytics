# valid_transactions View Design

**Problem:** Transaction queries across the codebase must manually apply three filters (exclude_from_totals, transaction_class, flagged-removed). Forgetting any filter causes inflated spending totals, duplicate data in insights, and incorrect reports. This has happened repeatedly — each fix requires auditing all 53 `FROM transactions` occurrences across 14 files.

**Solution:** A SQL view `valid_transactions` that bakes in all filters and pre-joins categories. Queries that need "spending data" use the view; queries that need raw data use the table directly.

## The View

```sql
DROP VIEW IF EXISTS valid_transactions;
CREATE VIEW valid_transactions AS
SELECT t.*,
       c.name AS category_name,
       c.color AS category_color,
       c.category_group
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE COALESCE(c.exclude_from_totals, 0) = 0
  AND (t.transaction_class IS NULL OR t.transaction_class IN ('purchase', 'fee', 'interest'))
  AND NOT EXISTS (
    SELECT 1 FROM transaction_flags tf
    WHERE tf.transaction_id = t.id AND tf.resolution = 'removed'
  );
```

**What the view provides:**
- All columns from `transactions` (id, date, description, amount, type, etc.)
- `category_name`, `category_color`, `category_group` from the joined categories table
- Uncategorized transactions included (LEFT JOIN — category fields are NULL)
- Transfers, refunds, payments, and flagged-removed transactions excluded

## Migration: View vs. Raw Table

### Use `valid_transactions` (filtered + categories joined):
- `src/lib/db/reports.ts` — all report/summary queries
- `src/lib/db/health.ts` — income vs spending
- `src/lib/db/commitments.ts` — commitment detection
- `src/lib/db/merchants.ts` — merchant stats, description groups, transaction lists
- `src/lib/insights/compact-data.ts` — all LLM context data

### Stay on raw `transactions`:
- `src/lib/db/transactions.ts` — CRUD (insert, update, delete, get by ID, listing)
- `src/lib/db/transaction-flags.ts` — flag queries need unfiltered access
- `src/lib/detect-duplicates.ts` — detection must see everything
- `src/lib/pipeline.ts` — processing needs raw access
- `src/lib/db/merchant-categories.ts` — merchant memory operates on raw data
- `src/lib/db/documents.ts` — document-level queries
- `src/lib/db/insight-cache.ts` — cache key counts all transactions
- API routes that pass through to these modules

## Migration Pattern

Before:
```sql
SELECT ... FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
WHERE t.type = 'debit' AND ${VALID_TRANSACTION_FILTER}
```

After:
```sql
SELECT ... FROM valid_transactions t
WHERE t.type = 'debit'
```

- `LEFT JOIN categories` removed (view provides category_name, category_color, category_group)
- `c.name` references become `t.category_name`
- `VALID_TRANSACTION_FILTER` import removed
- Manual NOT EXISTS clauses for transaction_flags removed

## Cleanup

- Delete `VALID_TRANSACTION_FILTER` from `src/lib/db/filters.ts`
- Remove or repurpose `filters.ts` if nothing else remains in it

## Schema

- `DROP VIEW IF EXISTS` + `CREATE VIEW` in `initializeSchema()` — views can't be altered, so drop+recreate on every startup ensures schema changes propagate
- Placed after all table creation and seed data

## Testing

- **View correctness test:** Insert a flagged-removed transaction, a transfer-category transaction, a payment-class transaction, and a normal purchase. Assert only the purchase appears in `SELECT * FROM valid_transactions`.
- **Existing tests:** Should pass without changes — they call the same functions, which now use the view internally.
- **Lint test:** Grep migrated files for raw `FROM transactions` — should find none. Ensures future queries in these files use the view.
