# Classification Improvements Design

## Problem

The current classification system has three issues:

1. **No document type awareness** — credit card payments show as "Income" because the prompt assumes all credits are income. On credit card statements, credits are bill payments or refunds.
2. **Too few categories** — 11 categories are too coarse for useful expense tracking. Users need ~25 detailed categories (Mint/YNAB-style).
3. **No re-upload or reclassification** — uploading the same file creates duplicates. There's no way to benefit from improved prompts or categories without losing existing data.

## Design

### 1. Document Type Detection & Context-Aware Prompting

The LLM prompt is restructured to handle document type detection and context-aware categorization in a single API call.

**Phase 1 — Detect document type.** The prompt asks the LLM to identify the statement type: credit card, checking account, savings account, investment, or other.

**Phase 2 — Interpret accordingly.** Based on document type:
- **Credit card**: credits = payments/refunds (not income), debits = purchases
- **Bank account**: credits = deposits/income, debits = spending
- **Other**: adapt as appropriate

The detected document type is stored on the `documents` table (`document_type` column) for future reference during reclassification.

### 2. Expanded Categories

Replace the current 11 categories with 26:

| Category | Examples |
|---|---|
| Groceries | Supermarkets, food stores |
| Restaurants & Dining | Restaurants, coffee shops, fast food |
| Gas & Fuel | Gas stations |
| Public Transit | Bus, subway, rail passes |
| Rideshare & Taxi | Uber, Lyft, taxis |
| Parking & Tolls | Parking garages, toll charges |
| Rent & Mortgage | Rent, mortgage payments |
| Home Maintenance | Repairs, cleaning, lawn care |
| Utilities | Electric, water, gas, internet, phone |
| Subscriptions | Streaming, SaaS, memberships |
| Shopping | General retail, Amazon, clothing |
| Electronics | Tech purchases, gadgets |
| Health & Medical | Doctor, pharmacy, dental |
| Fitness | Gym, sports, wellness |
| Insurance | Health, auto, home, life |
| Childcare & Education | Tuition, daycare, school supplies |
| Pets | Vet, pet food, pet supplies |
| Travel | Hotels, flights, vacation |
| Entertainment | Movies, concerts, events, games |
| Gifts & Donations | Charity, presents |
| Personal Care | Haircuts, spa, cosmetics |
| Income | Salary, freelance, interest |
| Transfer | Account transfers, bill payments |
| Refund | Returns, reimbursements |
| Fees & Charges | Bank fees, late fees, ATM fees |
| Other | Anything that doesn't fit |

### 3. File Deduplication & Reclassification

**SHA-256 hashing** for exact file detection:
- Compute SHA-256 of the uploaded PDF buffer before saving to disk
- Store in new `file_hash` column on `documents` table
- On upload, check if a document with the same hash already exists

**Same file (hash match) — reclassify only:**
- Skip PDF extraction entirely
- Load existing transactions for that document from the database
- Send just the transaction data to the LLM with the current category list
- Update categories on transactions that don't have the manual override flag set

**New file (no hash match) — extract and merge:**
- Run full PDF extraction as normal
- For each extracted transaction, check for duplicates against all existing transactions: match on `date + description + amount + type` (all four must match exactly)
- **Duplicate found**: reclassify it (update category, unless manually overridden)
- **No duplicate**: insert as new transaction linked to the new document

A transaction belongs to the document that first introduced it. Duplicate transactions found during merge are reclassified in place but not moved.

### 4. Manual Override Tracking

- New `manual_category` column on `transactions` (integer, default 0)
- When a user changes a category via the API, set `manual_category = 1`
- During any reclassification, skip transactions where `manual_category = 1`

## Schema Changes

### documents table
```sql
ALTER TABLE documents ADD COLUMN file_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN document_type TEXT;
CREATE INDEX idx_documents_hash ON documents(file_hash);
```

### transactions table
```sql
ALTER TABLE transactions ADD COLUMN manual_category INTEGER NOT NULL DEFAULT 0;
```

### categories table
Drop and re-seed with the expanded 26 categories. Existing `category_id` foreign keys will need remapping — transactions referencing old category IDs get their categories set to NULL (they'll be reclassified).

## API Changes

### Modified: POST /api/upload
1. Compute SHA-256 of uploaded buffer
2. Query `documents` by `file_hash`
3. **Hash match**: trigger reclassify-only flow (no file save, no extraction)
4. **No match**: save file, extract transactions, merge with duplicate detection

### Modified: PATCH /api/transactions/[id]
Set `manual_category = 1` when updating `category_id`.

### New: POST /api/reclassify/[documentId]
Trigger reclassification on demand for a specific document without re-uploading. Reads the stored `document_type`, loads transactions, sends to LLM for re-categorization. Respects `manual_category` flag.

## LLM Prompt Changes

### Extraction prompt (full PDF)
Restructured to:
1. Identify document type first
2. Apply context-aware debit/credit semantics
3. Use expanded 26-category list with brief descriptions of each

### Reclassify prompt (transaction list only, no PDF)
Lighter prompt that receives:
- Document type
- List of transactions (date, description, amount, type)
- The 26-category list

Returns updated category assignments. Cheaper and faster than re-extracting from PDF.

## Files Changed

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | New columns, expanded seed categories, migration logic |
| `src/lib/claude/schemas.ts` | Expanded category list, document type in extraction schema |
| `src/lib/claude/extract-transactions.ts` | New extraction prompt, new `reclassifyTransactions()` function |
| `src/app/api/upload/route.ts` | SHA-256 check, reclassify-only branch, merge with dedup |
| `src/app/api/transactions/[id]/route.ts` | Set `manual_category = 1` on category update |
| `src/app/api/reclassify/[documentId]/route.ts` | New route for on-demand reclassification |
| `src/lib/db/documents.ts` | `findByHash()` query, store `document_type` |
| `src/lib/db/transactions.ts` | Duplicate detection query, bulk category update respecting manual flag |
