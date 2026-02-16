# Editable Transaction Type & Class — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to edit transaction `type` (debit/credit) and `transaction_class` (purchase/payment/refund/fee/interest/transfer) inline in the transaction table.

**Architecture:** Extend the existing PATCH endpoint to accept optional `type` and `transaction_class` fields. Add two new DB functions. Add inline Select dropdowns in the table matching the existing category edit UX pattern.

**Tech Stack:** Next.js API routes, better-sqlite3, shadcn/ui Select, React state

---

### Task 1: DB layer — `updateTransactionType` and `updateTransactionClass`

**Files:**
- Modify: `src/lib/db/transactions.ts:114-116` (add new functions after `updateTransactionCategory`)
- Test: `src/__tests__/lib/db/transactions.test.ts`

**Step 1: Write failing tests**

Add to `src/__tests__/lib/db/transactions.test.ts` — import `updateTransactionType, updateTransactionClass` alongside existing imports:

```typescript
it('updates transaction type', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])
  const txns = listTransactions(db, {})
  updateTransactionType(db, txns.transactions[0].id, 'credit')
  const updated = listTransactions(db, {})
  expect(updated.transactions[0].type).toBe('credit')
})

it('updates transaction class', () => {
  insertTransactions(db, docId, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])
  const txns = listTransactions(db, {})
  updateTransactionClass(db, txns.transactions[0].id, 'transfer')
  const updated = listTransactions(db, {})
  expect(updated.transactions[0].transaction_class).toBe('transfer')
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: FAIL — `updateTransactionType` and `updateTransactionClass` not exported

**Step 3: Implement the functions**

Add to `src/lib/db/transactions.ts` after line 116 (after `updateTransactionCategory`):

```typescript
export function updateTransactionType(db: Database.Database, transactionId: number, type: 'debit' | 'credit'): void {
  db.prepare('UPDATE transactions SET type = ? WHERE id = ?').run(type, transactionId)
}

export function updateTransactionClass(db: Database.Database, transactionId: number, transactionClass: string): void {
  db.prepare('UPDATE transactions SET transaction_class = ? WHERE id = ?').run(transactionClass, transactionId)
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/transactions.test.ts`
Expected: PASS (all tests including new ones)

**Step 5: Commit**

```bash
git add src/lib/db/transactions.ts src/__tests__/lib/db/transactions.test.ts
git commit -m "feat: add updateTransactionType and updateTransactionClass DB functions"
```

---

### Task 2: API — extend PATCH endpoint

**Files:**
- Modify: `src/app/api/transactions/[id]/route.ts`

**Step 1: Update PATCH handler**

Replace the entire PATCH function in `src/app/api/transactions/[id]/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { updateTransactionCategory, updateTransactionType, updateTransactionClass } from '@/lib/db/transactions'
import { setMerchantCategory } from '@/lib/db/merchant-categories'

const VALID_TYPES = ['debit', 'credit'] as const
const VALID_CLASSES = ['purchase', 'payment', 'refund', 'fee', 'interest', 'transfer'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { category_id, type, transaction_class } = body

  // Must provide at least one field
  if (category_id === undefined && type === undefined && transaction_class === undefined) {
    return NextResponse.json({ error: 'At least one of category_id, type, or transaction_class is required' }, { status: 400 })
  }

  const db = getDb()
  const txnId = Number(id)

  if (category_id !== undefined) {
    if (typeof category_id !== 'number') {
      return NextResponse.json({ error: 'category_id must be a number' }, { status: 400 })
    }
    updateTransactionCategory(db, txnId, category_id, true)

    // Propagate manual override to merchant classification memory
    const txn = db.prepare('SELECT normalized_merchant FROM transactions WHERE id = ?').get(txnId) as { normalized_merchant: string | null } | undefined
    if (txn?.normalized_merchant) {
      setMerchantCategory(db, txn.normalized_merchant, category_id, 'manual', 1.0)
    }
  }

  if (type !== undefined) {
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    updateTransactionType(db, txnId, type)
  }

  if (transaction_class !== undefined) {
    if (!VALID_CLASSES.includes(transaction_class)) {
      return NextResponse.json({ error: `transaction_class must be one of: ${VALID_CLASSES.join(', ')}` }, { status: 400 })
    }
    updateTransactionClass(db, txnId, transaction_class)
  }

  return NextResponse.json({ success: true })
}
```

**Step 2: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add "src/app/api/transactions/[id]/route.ts"
git commit -m "feat: extend PATCH /api/transactions/[id] to accept type and transaction_class"
```

---

### Task 3: UI — inline type and class editors

**Files:**
- Modify: `src/components/transaction-table.tsx`

**Step 1: Add update functions**

In `src/components/transaction-table.tsx`, add two handler functions after the existing `updateCategory` function (line 100):

```typescript
const updateType = async (transactionId: number, type: string) => {
  await fetch(`/api/transactions/${transactionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  }).catch(() => {})
  await fetchTransactions(page)
}

const updateClass = async (transactionId: number, transactionClass: string) => {
  await fetch(`/api/transactions/${transactionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_class: transactionClass }),
  }).catch(() => {})
  await fetchTransactions(page)
}
```

**Step 2: Add shadcn Select import**

Add to imports at top of file:

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

**Step 3: Replace the Type column cell**

Replace lines 196-207 (the Type `<TableCell>`) with:

```tsx
<TableCell className="py-1.5">
  <div className="flex items-center gap-1.5">
    <Select value={txn.type} onValueChange={(v) => updateType(txn.id, v)}>
      <SelectTrigger className="h-6 w-[72px] border-0 bg-transparent px-1 text-[11px] uppercase tracking-wide shadow-none hover:bg-muted focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="debit" className="text-xs">Debit</SelectItem>
        <SelectItem value="credit" className="text-xs">Credit</SelectItem>
      </SelectContent>
    </Select>
    <Select value={txn.transaction_class ?? 'purchase'} onValueChange={(v) => updateClass(txn.id, v)}>
      <SelectTrigger className="h-6 w-[88px] border-0 bg-transparent px-1 text-[10px] shadow-none hover:bg-muted focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="purchase" className="text-xs">purchase</SelectItem>
        <SelectItem value="payment" className="text-xs">payment</SelectItem>
        <SelectItem value="refund" className="text-xs">refund</SelectItem>
        <SelectItem value="fee" className="text-xs">fee</SelectItem>
        <SelectItem value="interest" className="text-xs">interest</SelectItem>
        <SelectItem value="transfer" className="text-xs">transfer</SelectItem>
      </SelectContent>
    </Select>
  </div>
</TableCell>
```

**Step 4: Update the Amount cell color logic**

The amount cell (line 193) uses `txn.type` for color. Since type is now editable, this already works reactively — after `fetchTransactions` re-renders, the color updates. No change needed.

**Step 5: Manual test**

Run: `npm run dev`
Visit: `http://localhost:3000/transactions`
Verify:
- Type column shows a clickable dropdown (debit/credit)
- Class shows a clickable dropdown (6 options)
- Selecting a new value updates immediately
- Amount color changes if type changes debit↔credit

**Step 6: Commit**

```bash
git add src/components/transaction-table.tsx
git commit -m "feat: inline editable type and class dropdowns in transaction table"
```

---

### Task 4: Run full test suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 3: Final commit (if any lint/type fixes needed)**

Only if fixes were required.
