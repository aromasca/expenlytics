# Merchant Split & Merge Prevention

## Problem

Merchant merges are irreversible. LLM normalization and suggest-merges collapse different financial products from the same institution (e.g. "JPMorgan Chase ACH" mortgage payments and "Chase Credit Card ePay" credit card payments) into one merchant. Users have no visibility into what transactions are under a merchant before merging, and no way to undo it.

## Design

### 1. Expandable Merchant Rows (Two Levels)

On the merchants page, clicking a merchant row expands it to show **description groups** — transactions grouped by their raw `description` pattern.

**Level 1 — Description Groups**:
- Description pattern (e.g. "Chase Credit Card ePay")
- Transaction count and total amount
- Date range
- Checkbox for selection

**Level 2 — Individual Transactions** (expand a group):
- Date, description, amount
- Individual transaction checkboxes

Selection works at both levels: select entire groups or cherry-pick transactions.

### 2. Split Flow

When groups/transactions are selected within an expanded merchant, a "Split" button appears in the selection bar.

**Flow**:
1. User selects description groups or individual transactions
2. Clicks "Split"
3. Selected transaction descriptions are sent to LLM for re-normalization
4. Confirmation dialog shows LLM-suggested new merchant name(s)
5. User can edit the name before confirming
6. On confirm: `normalized_merchant` is updated on selected transactions, `merchant_categories` cache is updated

**API**: `POST /api/merchants/split` — accepts transaction IDs and optionally a target merchant name. If no name provided, calls LLM to suggest one.

### 3. Merge Prevention — Description Preview

Before any merge (manual or LLM-suggested), the merge dialog shows distinct description patterns being collapsed:

```
Merging into "JPMorgan Chase":
  - JPMorgan Chase ACH (12 txns, $26,885)
  - Chase Credit Card ePay (28 txns, $52,340)
  - Chase Credit Card AutoPay (7 txns, $6,301)
```

This lets users spot when fundamentally different transaction types are about to be merged.

### 4. LLM Prompt Improvements

**Normalization prompt** (`src/lib/llm/prompts/`): Add rule — "Treat different financial products from the same institution as separate merchants (e.g. 'Chase Mortgage' vs 'Chase Credit Card Payment')."

**Suggest-merges prompt** (`src/lib/llm/suggest-merges.ts`): Remove the "Chase / JPMorgan Chase" example. Add negative example: "Do NOT merge different products from the same bank (mortgage payments and credit card payments are different merchants)."

## Non-Goals

- Transaction reassignment from the transactions page (future work)
- Merge history / full undo log
- Automatic split detection
