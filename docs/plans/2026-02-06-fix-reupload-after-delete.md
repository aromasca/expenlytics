# Fix Re-Upload After Transaction Deletion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow re-uploading a PDF after its transactions have been deleted, by cleaning up orphaned document records.

**Architecture:** When transactions are deleted via the API, check if any parent documents became empty (no remaining transactions) and delete those document records. This removes the stale `file_hash` entry, so re-uploading the same file takes the "new file" extraction path instead of the "reclassify" path that fails on 0 transactions.

**Tech Stack:** SQLite (better-sqlite3), Next.js API routes, Vitest

---

## Bug Analysis

**Root cause:** `src/app/api/upload/route.ts:33-40` — When a file is uploaded, its SHA256 hash is checked against existing documents via `findDocumentByHash()`. If a match is found, the route enters a "reclassify" branch that expects existing transactions. But when all transactions were previously deleted, the document record (with its hash) remains orphaned, so the reclassify branch finds 0 transactions and returns a `400` error: "No transactions to reclassify." Renaming the file doesn't help because the hash is computed from file *content*, not filename.

**Fix strategy:** Add a `deleteOrphanedDocuments()` DB function and call it after transaction deletion. This ensures stale document records don't block re-uploads.

---

### Task 1: Add `deleteOrphanedDocuments` DB Function

**Files:**
- Test: `src/__tests__/lib/db/documents.test.ts`
- Modify: `src/lib/db/documents.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/lib/db/documents.test.ts`. Requires importing `insertTransactions` and `deleteTransactions` from transactions module.

```typescript
import { insertTransactions, deleteTransactions, listTransactions } from '@/lib/db/transactions'

// ... inside describe('documents') block:

it('deletes completed documents with no remaining transactions', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash123')
  updateDocumentStatus(db, id, 'completed')
  insertTransactions(db, id, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])
  const txns = listTransactions(db, { document_id: id })
  deleteTransactions(db, txns.transactions.map(t => t.id))

  const deleted = deleteOrphanedDocuments(db)
  expect(deleted).toBe(1)
  expect(getDocument(db, id)).toBeUndefined()
})

it('preserves documents that still have transactions', () => {
  const id = createDocument(db, 'test.pdf', '/path/test.pdf', 'hash456')
  updateDocumentStatus(db, id, 'completed')
  insertTransactions(db, id, [
    { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
  ])

  const deleted = deleteOrphanedDocuments(db)
  expect(deleted).toBe(0)
  expect(getDocument(db, id)).toBeDefined()
})

it('preserves pending/processing documents even with no transactions', () => {
  const id1 = createDocument(db, 'pending.pdf', '/path/pending.pdf', 'hashA')
  const id2 = createDocument(db, 'processing.pdf', '/path/processing.pdf', 'hashB')
  updateDocumentStatus(db, id2, 'processing')

  const deleted = deleteOrphanedDocuments(db)
  expect(deleted).toBe(0)
  expect(getDocument(db, id1)).toBeDefined()
  expect(getDocument(db, id2)).toBeDefined()
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: FAIL — `deleteOrphanedDocuments` is not exported / not defined

**Step 3: Write minimal implementation**

Add to `src/lib/db/documents.ts`:

```typescript
export function deleteOrphanedDocuments(db: Database.Database): number {
  const result = db.prepare(`
    DELETE FROM documents
    WHERE status IN ('completed', 'failed')
      AND id NOT IN (SELECT DISTINCT document_id FROM transactions)
  `).run()
  return result.changes
}
```

Note: includes `'failed'` status since failed documents also have no useful transactions.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/db/documents.ts src/__tests__/lib/db/documents.test.ts
git commit -m "feat: add deleteOrphanedDocuments DB function"
```

---

### Task 2: Call Orphan Cleanup After Transaction Deletion

**Files:**
- Modify: `src/app/api/transactions/route.ts`

**Step 1: Write the failing test (manual verification)**

There's no unit test file for the API routes in this project — they are tested via integration. Instead we'll verify by reading the code change and running the full test suite.

**Step 2: Modify the DELETE handler**

In `src/app/api/transactions/route.ts`, import `deleteOrphanedDocuments` and call it after `deleteTransactions`:

```typescript
import { deleteOrphanedDocuments } from '@/lib/db/documents'
```

Then after line 57 (`const deleted = deleteTransactions(db, ids)`), add:

```typescript
deleteOrphanedDocuments(db)
```

The full DELETE handler becomes:

```typescript
export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const ids: number[] = body.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  if (!ids.every(id => typeof id === 'number' && Number.isInteger(id))) {
    return NextResponse.json({ error: 'ids must be integers' }, { status: 400 })
  }

  const db = getDb()
  const deleted = deleteTransactions(db, ids)
  deleteOrphanedDocuments(db)
  return NextResponse.json({ deleted })
}
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/app/api/transactions/route.ts
git commit -m "fix: clean up orphaned documents after transaction deletion"
```

---

### Task 3: Add Integration Test for Full Delete-Reupload Flow

**Files:**
- Modify: `src/__tests__/lib/db/documents.test.ts`

**Step 1: Write the integration test**

This test verifies the full user flow: upload creates a document with hash → delete all transactions → orphan cleanup removes document → `findDocumentByHash` returns undefined (allowing re-upload).

Add to `src/__tests__/lib/db/documents.test.ts`:

```typescript
it('allows re-upload after deleting all transactions (full flow)', () => {
  // 1. Simulate upload: create document with hash
  const id = createDocument(db, 'statement.pdf', '/data/uploads/statement.pdf', 'reupload-hash')
  updateDocumentStatus(db, id, 'completed')
  insertTransactions(db, id, [
    { date: '2025-01-15', description: 'Grocery Store', amount: 85, type: 'debit' },
    { date: '2025-01-16', description: 'Gas Station', amount: 45, type: 'debit' },
  ])

  // 2. Verify document is found by hash (re-upload would be blocked)
  expect(findDocumentByHash(db, 'reupload-hash')).toBeDefined()

  // 3. Delete all transactions
  const txns = listTransactions(db, { document_id: id })
  deleteTransactions(db, txns.transactions.map(t => t.id))

  // 4. Run orphan cleanup (called by DELETE API route)
  deleteOrphanedDocuments(db)

  // 5. Verify document is gone — re-upload would now take the "new file" path
  expect(findDocumentByHash(db, 'reupload-hash')).toBeUndefined()
})
```

**Step 2: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/documents.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/lib/db/documents.test.ts
git commit -m "test: add integration test for delete-reupload flow"
```

---

### Task 4: Run Full Test Suite and Verify Build

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Final commit (if any lint/build fixes needed)**

Only if previous steps required changes.
