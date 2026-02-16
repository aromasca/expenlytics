# Accounts Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect bank accounts from uploaded statements and display a completeness grid showing which monthly statements are present or missing.

**Architecture:** New `accounts` table with FK on `documents`. LLM extraction adds account identity fields. Pipeline matches/creates accounts after extraction. New API routes + React page with year-grouped completeness grid.

**Tech Stack:** Next.js App Router, SQLite (better-sqlite3), Zod, Anthropic/OpenAI LLM, shadcn/ui, Tailwind CSS v4, Vitest

---

### Task 1: Database Schema — `accounts` table + `documents.account_id`

**Files:**
- Modify: `src/lib/db/schema.ts`

**Step 1: Add `accounts` table creation and `documents.account_id` migration**

In `initializeSchema()`, after the `dismissed_subscriptions` table creation (line ~234), add:

```typescript
// Accounts table — auto-detected from uploaded statements
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution TEXT,
    last_four TEXT,
    type TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)
```

Then in the documents migration section (after the existing `transaction_count` migration around line 163), add:

```typescript
if (!columnNames.includes('account_id')) {
  db.exec('ALTER TABLE documents ADD COLUMN account_id INTEGER REFERENCES accounts(id)')
}
```

Add an index after the existing `idx_documents_hash` (line ~186):

```typescript
db.exec('CREATE INDEX IF NOT EXISTS idx_documents_account ON documents(account_id)')
```

**Step 2: Run tests to verify schema migration doesn't break anything**

Run: `npm test`
Expected: All 189 tests pass

**Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(accounts): add accounts table and documents.account_id column"
```

---

### Task 2: Accounts DB module — CRUD + completeness query

**Files:**
- Create: `src/lib/db/accounts.ts`
- Create: `src/__tests__/lib/db/accounts.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import {
  createAccount,
  findAccountByInstitutionAndLastFour,
  getAccount,
  listAccountsWithCompleteness,
  renameAccount,
  mergeAccounts,
  getUnassignedDocuments,
  assignDocumentToAccount,
} from '@/lib/db/accounts'
import { createDocument } from '@/lib/db/documents'

describe('accounts', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  describe('createAccount', () => {
    it('creates an account and returns its id', () => {
      const id = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      expect(id).toBe(1)
      const account = getAccount(db, id)
      expect(account).toMatchObject({ name: 'Chase Sapphire', institution: 'Chase', last_four: '4821', type: 'credit_card' })
    })
  })

  describe('findAccountByInstitutionAndLastFour', () => {
    it('finds existing account by institution and last four', () => {
      const id = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const found = findAccountByInstitutionAndLastFour(db, 'Chase', '4821')
      expect(found?.id).toBe(id)
    })

    it('returns undefined when no match', () => {
      const found = findAccountByInstitutionAndLastFour(db, 'Chase', '9999')
      expect(found).toBeUndefined()
    })
  })

  describe('renameAccount', () => {
    it('updates account name', () => {
      const id = createAccount(db, { name: 'Old Name', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      renameAccount(db, id, 'New Name')
      expect(getAccount(db, id)?.name).toBe('New Name')
    })
  })

  describe('mergeAccounts', () => {
    it('reassigns documents from source to target and deletes source', () => {
      const target = createAccount(db, { name: 'Target', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const source = createAccount(db, { name: 'Source', institution: 'Chase', lastFour: '4822', type: 'credit_card' })

      const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf', 'hash1')
      assignDocumentToAccount(db, docId, source)

      mergeAccounts(db, source, target)

      // Document reassigned to target
      const doc = db.prepare('SELECT account_id FROM documents WHERE id = ?').get(docId) as { account_id: number }
      expect(doc.account_id).toBe(target)

      // Source account deleted
      expect(getAccount(db, source)).toBeUndefined()
    })
  })

  describe('listAccountsWithCompleteness', () => {
    it('returns accounts with month coverage from transaction dates', () => {
      const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf', 'hash1')
      assignDocumentToAccount(db, docId, accId)
      db.prepare('UPDATE documents SET status = ? WHERE id = ?').run('completed', docId)

      // Insert transactions for Jan and Mar 2025 (Feb missing)
      const catId = db.prepare('SELECT id FROM categories LIMIT 1').get() as { id: number }
      const insert = db.prepare('INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)')
      insert.run(docId, '2025-01-15', 'Test', 10, 'debit', catId.id)
      insert.run(docId, '2025-03-15', 'Test', 20, 'debit', catId.id)

      const accounts = listAccountsWithCompleteness(db)
      expect(accounts).toHaveLength(1)
      expect(accounts[0].name).toBe('Chase')
      expect(accounts[0].documentCount).toBeGreaterThanOrEqual(1)
      expect(accounts[0].months['2025-01']).toBe('complete')
      expect(accounts[0].months['2025-02']).toBe('missing')
      expect(accounts[0].months['2025-03']).toBe('complete')
    })
  })

  describe('getUnassignedDocuments', () => {
    it('returns documents with null account_id', () => {
      createDocument(db, 'unassigned.pdf', '/tmp/unassigned.pdf', 'hash1')
      const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
      const assignedDocId = createDocument(db, 'assigned.pdf', '/tmp/assigned.pdf', 'hash2')
      assignDocumentToAccount(db, assignedDocId, accId)

      const unassigned = getUnassignedDocuments(db)
      expect(unassigned).toHaveLength(1)
      expect(unassigned[0].filename).toBe('unassigned.pdf')
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/db/accounts.test.ts`
Expected: FAIL — module `@/lib/db/accounts` does not exist

**Step 3: Write the implementation**

```typescript
import type Database from 'better-sqlite3'

export interface Account {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  created_at: string
}

export interface AccountWithCompleteness extends Account {
  documentCount: number
  months: Record<string, 'complete' | 'missing'>
}

interface CreateAccountInput {
  name: string
  institution?: string | null
  lastFour?: string | null
  type: string
}

export function createAccount(db: Database.Database, input: CreateAccountInput): number {
  const result = db.prepare(
    'INSERT INTO accounts (name, institution, last_four, type) VALUES (?, ?, ?, ?)'
  ).run(input.name, input.institution ?? null, input.lastFour ?? null, input.type)
  return result.lastInsertRowid as number
}

export function getAccount(db: Database.Database, id: number): Account | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined
}

export function findAccountByInstitutionAndLastFour(
  db: Database.Database,
  institution: string,
  lastFour: string
): Account | undefined {
  return db.prepare(
    'SELECT * FROM accounts WHERE institution = ? AND last_four = ?'
  ).get(institution, lastFour) as Account | undefined
}

export function renameAccount(db: Database.Database, id: number, name: string): void {
  db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name, id)
}

export function mergeAccounts(db: Database.Database, sourceId: number, targetId: number): void {
  const merge = db.transaction(() => {
    db.prepare('UPDATE documents SET account_id = ? WHERE account_id = ?').run(targetId, sourceId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(sourceId)
  })
  merge()
}

export function assignDocumentToAccount(db: Database.Database, documentId: number, accountId: number): void {
  db.prepare('UPDATE documents SET account_id = ? WHERE id = ?').run(accountId, documentId)
}

export function getUnassignedDocuments(db: Database.Database) {
  return db.prepare(
    'SELECT id, filename, filepath, document_type, uploaded_at, status FROM documents WHERE account_id IS NULL ORDER BY uploaded_at DESC'
  ).all() as Array<{ id: number; filename: string; filepath: string; document_type: string | null; uploaded_at: string; status: string }>
}

export function listAccountsWithCompleteness(db: Database.Database): AccountWithCompleteness[] {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[]

  // Get the current month as YYYY-MM
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return accounts.map(account => {
    // Get document count for this account
    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM documents WHERE account_id = ? AND status = ?'
    ).get(account.id, 'completed') as { count: number }

    // Get distinct months that have transactions from this account's documents
    const monthRows = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', t.date) as month
      FROM transactions t
      JOIN documents d ON t.document_id = d.id
      WHERE d.account_id = ? AND d.status = 'completed'
      ORDER BY month
    `).all(account.id) as Array<{ month: string }>

    const coveredMonths = new Set(monthRows.map(r => r.month))

    // Build months map from earliest covered month to current month
    const months: Record<string, 'complete' | 'missing'> = {}

    if (coveredMonths.size > 0) {
      const sortedMonths = [...coveredMonths].sort()
      const earliest = sortedMonths[0]

      let cursor = earliest
      while (cursor <= currentMonth) {
        months[cursor] = coveredMonths.has(cursor) ? 'complete' : 'missing'
        // Advance to next month
        const [y, m] = cursor.split('-').map(Number)
        const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
        cursor = next
      }
    }

    return {
      ...account,
      documentCount: countRow.count,
      months,
    }
  })
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/__tests__/lib/db/accounts.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/db/accounts.ts src/__tests__/lib/db/accounts.test.ts
git commit -m "feat(accounts): add accounts DB module with CRUD and completeness query"
```

---

### Task 3: LLM Extraction — add account identity fields

**Files:**
- Modify: `src/lib/llm/schemas.ts`
- Modify: `src/lib/llm/prompts/extraction.ts`

**Step 1: Add account fields to rawExtractionSchema**

In `src/lib/llm/schemas.ts`, change the `rawExtractionSchema` (lines 73-76):

```typescript
export const rawExtractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  account_name: z.string().optional().describe('Account name as shown on statement, e.g. "Chase Sapphire Reserve"'),
  institution: z.string().optional().describe('Financial institution name, e.g. "Chase", "Bank of America"'),
  last_four: z.string().optional().describe('Last 4 digits of account number'),
  transactions: z.array(rawTransactionSchema),
})
```

**Step 2: Update extraction prompts**

In `src/lib/llm/prompts/extraction.ts`, update both `RAW_EXTRACTION_PROMPTS.anthropic` and `RAW_EXTRACTION_PROMPTS.openai` and both `TEXT_EXTRACTION_PROMPTS`.

For the **anthropic raw extraction prompt**, after "STEP 1: Identify the document type:" section and before "STEP 2: Extract every transaction", add:

```
STEP 1b: Extract account identity (if visible on the statement):
- account_name: the account or card name (e.g., "Sapphire Reserve", "Platinum Checking")
- institution: the bank or financial institution (e.g., "Chase", "Bank of America", "Wells Fargo")
- last_four: the last 4 digits of the account or card number
These fields are optional — only include them if clearly visible on the statement.
```

Update the JSON format block in all four prompts (anthropic raw, openai raw, anthropic text, openai text) to include the new fields:

```json
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "account_name": "optional account name",
  "institution": "optional institution name",
  "last_four": "optional last 4 digits",
  "transactions": [...]
}
```

**Step 3: Run existing extraction tests**

Run: `npm test -- src/__tests__/lib/llm`
Expected: All pass (schemas are backward-compatible since new fields are `.optional()`)

**Step 4: Commit**

```bash
git add src/lib/llm/schemas.ts src/lib/llm/prompts/extraction.ts
git commit -m "feat(accounts): add account identity fields to LLM extraction schema and prompts"
```

---

### Task 4: Pipeline Integration — account matching after extraction

**Files:**
- Modify: `src/lib/pipeline.ts`

**Step 1: Add account matching logic to processDocument**

At the top of `src/lib/pipeline.ts`, add import:

```typescript
import { createAccount, findAccountByInstitutionAndLastFour, assignDocumentToAccount } from '@/lib/db/accounts'
```

After the extraction phase completes (after line 79 where `updateDocumentTransactionCount` is called), and also after the `existingRaw` branch (line 54), add account matching logic. This should run right after we have `rawResult` (before normalization):

```typescript
// Account detection — match or create account from extraction metadata
try {
  const accountName = (rawResult as Record<string, unknown>).account_name as string | undefined
  const institution = (rawResult as Record<string, unknown>).institution as string | undefined
  const lastFour = (rawResult as Record<string, unknown>).last_four as string | undefined

  if (institution && lastFour) {
    const existing = findAccountByInstitutionAndLastFour(db, institution, lastFour)
    if (existing) {
      assignDocumentToAccount(db, documentId, existing.id)
      console.log(`[pipeline] Document ${documentId}: matched to account "${existing.name}" (id=${existing.id})`)
    } else {
      const name = accountName || `${institution} ·${lastFour}`
      const newId = createAccount(db, { name, institution, lastFour, type: rawResult.document_type })
      assignDocumentToAccount(db, documentId, newId)
      console.log(`[pipeline] Document ${documentId}: created new account "${name}" (id=${newId})`)
    }
  } else if (institution) {
    // No last_four — try matching by institution + document_type
    const existing = db.prepare(
      'SELECT * FROM accounts WHERE institution = ? AND type = ? LIMIT 1'
    ).get(institution, rawResult.document_type) as Record<string, unknown> | undefined
    if (existing) {
      assignDocumentToAccount(db, documentId, existing.id as number)
      console.log(`[pipeline] Document ${documentId}: matched to account "${existing.name}" by institution+type`)
    } else {
      const name = accountName || institution
      const newId = createAccount(db, { name, institution, lastFour: null, type: rawResult.document_type })
      assignDocumentToAccount(db, documentId, newId)
      console.log(`[pipeline] Document ${documentId}: created new account "${name}" (id=${newId})`)
    }
  } else {
    console.log(`[pipeline] Document ${documentId}: no account identity found in extraction`)
  }
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error'
  console.warn(`[pipeline] Document ${documentId}: account detection failed (non-blocking) — ${message}`)
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All pass (account detection is wrapped in try/catch, non-blocking)

**Step 3: Commit**

```bash
git add src/lib/pipeline.ts
git commit -m "feat(accounts): add account detection to document processing pipeline"
```

---

### Task 5: API Routes — accounts CRUD

**Files:**
- Create: `src/app/api/accounts/route.ts`
- Create: `src/app/api/accounts/[id]/route.ts`
- Create: `src/app/api/accounts/merge/route.ts`

**Step 1: Create `GET /api/accounts`**

```typescript
// src/app/api/accounts/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listAccountsWithCompleteness, getUnassignedDocuments } from '@/lib/db/accounts'

export async function GET() {
  const db = getDb()
  const accounts = listAccountsWithCompleteness(db)
  const unassigned = getUnassignedDocuments(db)
  return NextResponse.json({ accounts, unassigned })
}
```

**Step 2: Create `PATCH /api/accounts/[id]`**

```typescript
// src/app/api/accounts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { renameAccount, getAccount } from '@/lib/db/accounts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const accountId = parseInt(id, 10)
  if (isNaN(accountId)) {
    return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 })
  }

  const body = await request.json()
  const { name } = body
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const db = getDb()
  const account = getAccount(db, accountId)
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  renameAccount(db, accountId, name.trim())
  return NextResponse.json({ success: true })
}
```

**Step 3: Create `POST /api/accounts/merge`**

```typescript
// src/app/api/accounts/merge/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { mergeAccounts, getAccount } from '@/lib/db/accounts'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { sourceId, targetId } = body

  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    return NextResponse.json({ error: 'sourceId and targetId must be integers' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Cannot merge account into itself' }, { status: 400 })
  }

  const db = getDb()
  const source = getAccount(db, sourceId)
  const target = getAccount(db, targetId)
  if (!source || !target) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  mergeAccounts(db, sourceId, targetId)
  return NextResponse.json({ success: true })
}
```

**Step 4: Run build to verify routes compile**

Run: `npm run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add "src/app/api/accounts/route.ts" "src/app/api/accounts/[id]/route.ts" "src/app/api/accounts/merge/route.ts"
git commit -m "feat(accounts): add API routes for accounts list, rename, and merge"
```

---

### Task 6: Sidebar — add Accounts nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

**Step 1: Add the Accounts nav item**

Import `Building2` from `lucide-react` (represents financial institution).

Add between Documents and Reports in the `navItems` array:

```typescript
{ href: '/accounts', label: 'Accounts', icon: Building2 },
```

**Step 2: Verify visually**

Run: `npm run dev` and check sidebar shows "Accounts" between Documents and Reports.

**Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(accounts): add Accounts nav item to sidebar"
```

---

### Task 7: Accounts Page — completeness grid UI

**Files:**
- Create: `src/app/(app)/accounts/page.tsx`
- Create: `src/components/accounts/account-card.tsx`
- Create: `src/components/accounts/completeness-grid.tsx`

**Step 1: Create the completeness grid component**

`src/components/accounts/completeness-grid.tsx`:

```typescript
'use client'

import { cn } from '@/lib/utils'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface CompletenessGridProps {
  months: Record<string, 'complete' | 'missing'>
}

export function CompletenessGrid({ months }: CompletenessGridProps) {
  const entries = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No transaction data yet</p>

  // Group by year
  const byYear = new Map<string, Array<{ month: string; status: 'complete' | 'missing' | 'future' }>>()
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  for (const [ym, status] of entries) {
    const [year] = ym.split('-')
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({ month: ym, status: ym > currentYM ? 'future' : status })
  }

  return (
    <div className="space-y-2">
      {[...byYear.entries()].map(([year, months]) => {
        // Build a full 12-month row, but only from first to last relevant month
        const monthNums = months.map(m => parseInt(m.month.split('-')[1], 10))
        const minMonth = Math.min(...monthNums)
        const maxMonth = Math.max(...monthNums)
        const statusMap = new Map(months.map(m => [parseInt(m.month.split('-')[1], 10), m.status]))

        return (
          <div key={year} className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground w-8 shrink-0 tabular-nums">{year}</span>
            <div className="flex gap-1">
              {Array.from({ length: maxMonth - minMonth + 1 }, (_, i) => {
                const monthNum = minMonth + i
                const status = statusMap.get(monthNum)
                const ym = `${year}-${String(monthNum).padStart(2, '0')}`
                const isFuture = ym > currentYM

                return (
                  <div
                    key={monthNum}
                    title={`${MONTH_LABELS[monthNum - 1]} ${year}: ${isFuture ? 'future' : status ?? 'missing'}`}
                    className={cn(
                      'flex flex-col items-center gap-0.5',
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground leading-none">{MONTH_LABELS[monthNum - 1]}</span>
                    <div
                      className={cn(
                        'h-5 w-5 rounded-sm flex items-center justify-center text-[10px]',
                        isFuture && 'bg-muted text-muted-foreground/40',
                        !isFuture && status === 'complete' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                        !isFuture && status === 'missing' && 'bg-red-500/15 text-red-500 dark:text-red-400',
                        !isFuture && !status && 'bg-muted text-muted-foreground/40',
                      )}
                    >
                      {isFuture ? '·' : status === 'complete' ? '✓' : status === 'missing' ? '✗' : '·'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 2: Create the account card component**

`src/components/accounts/account-card.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Check, Pencil, X } from 'lucide-react'
import { CompletenessGrid } from './completeness-grid'

interface AccountCardProps {
  account: {
    id: number
    name: string
    institution: string | null
    last_four: string | null
    type: string
    documentCount: number
    months: Record<string, 'complete' | 'missing'>
  }
  selected: boolean
  onSelect: (id: number) => void
  onRename: (id: number, name: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  credit_card: 'Credit Card',
  checking_account: 'Checking',
  savings_account: 'Savings',
  investment: 'Investment',
  other: 'Other',
}

export function AccountCard({ account, selected, onSelect, onRename }: AccountCardProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(account.name)

  const handleSave = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== account.name) {
      onRename(account.id, trimmed)
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setEditName(account.name)
    setEditing(false)
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(account.id)}
            className="h-3.5 w-3.5 rounded border-border shrink-0"
          />
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
                className="h-6 text-xs w-48"
                autoFocus
              />
              <button onClick={handleSave} className="text-muted-foreground hover:text-foreground">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate">{account.name}</span>
              <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground shrink-0">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          {account.last_four && (
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">·{account.last_four}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[11px] font-normal">{TYPE_LABELS[account.type] ?? account.type}</Badge>
          <span className="text-[11px] text-muted-foreground">{account.documentCount} {account.documentCount === 1 ? 'statement' : 'statements'}</span>
        </div>
      </div>
      <CompletenessGrid months={account.months} />
    </Card>
  )
}
```

**Step 3: Create the accounts page**

`src/app/(app)/accounts/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AccountCard } from '@/components/accounts/account-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AccountData {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  documentCount: number
  months: Record<string, 'complete' | 'missing'>
}

interface UnassignedDoc {
  id: number
  filename: string
  document_type: string | null
  status: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountData[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<number | null>(null)

  const fetchAccounts = useCallback(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts)
        setUnassigned(data.unassigned)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRename = (id: number, name: string) => {
    fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(() => fetchAccounts())
      .catch(() => {})
  }

  const handleMerge = () => {
    if (!mergeTarget || selected.size < 2) return
    const sources = [...selected].filter(id => id !== mergeTarget)
    Promise.all(
      sources.map(sourceId =>
        fetch('/api/accounts/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, targetId: mergeTarget }),
        })
      )
    )
      .then(() => {
        setSelected(new Set())
        setMergeOpen(false)
        setMergeTarget(null)
        fetchAccounts()
      })
      .catch(() => {})
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <p className="text-xs text-muted-foreground mt-4">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Accounts</h1>
        {selected.size >= 2 && (
          <Button variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setMergeOpen(true)}>
            Merge {selected.size} accounts
          </Button>
        )}
      </div>

      {accounts.length === 0 && unassigned.length === 0 ? (
        <p className="text-xs text-muted-foreground">No accounts detected yet. Upload bank statements to get started.</p>
      ) : (
        <div className="space-y-2">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              selected={selected.has(account.id)}
              onSelect={handleSelect}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground">Unassigned Documents ({unassigned.length})</h2>
          <div className="text-xs text-muted-foreground space-y-1">
            {unassigned.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 py-1">
                <span className="truncate">{doc.filename}</span>
                <span className="text-[11px] text-muted-foreground/60">{doc.status}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground/60 pt-1">
              Reprocess these documents from the Documents page to detect their accounts.
            </p>
          </div>
        </div>
      )}

      {/* Merge dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Accounts</DialogTitle>
            <DialogDescription>
              Select the target account. All documents from the other selected accounts will be moved to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {accounts.filter(a => selected.has(a.id)).map(a => (
              <label key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer text-sm">
                <input
                  type="radio"
                  name="merge-target"
                  checked={mergeTarget === a.id}
                  onChange={() => setMergeTarget(a.id)}
                  className="h-3.5 w-3.5"
                />
                {a.name}
                {a.last_four && <span className="text-muted-foreground text-[11px]">·{a.last_four}</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-7 text-xs" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button className="h-7 text-xs" disabled={!mergeTarget} onClick={handleMerge}>Merge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Step 4: Verify the page renders**

Run: `npm run dev` and navigate to `/accounts`
Expected: Page renders with "No accounts detected yet" message (or accounts if data exists)

**Step 5: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add "src/app/(app)/accounts/page.tsx" src/components/accounts/account-card.tsx src/components/accounts/completeness-grid.tsx
git commit -m "feat(accounts): add accounts page with completeness grid and merge UI"
```

---

### Task 8: Integration test — full pipeline account detection

**Files:**
- Create: `src/__tests__/lib/pipeline-accounts.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createAccount, findAccountByInstitutionAndLastFour, assignDocumentToAccount, listAccountsWithCompleteness } from '@/lib/db/accounts'
import { createDocument } from '@/lib/db/documents'

describe('account detection integration', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('matches document to existing account by institution and last_four', () => {
    const accId = createAccount(db, { name: 'Chase Sapphire', institution: 'Chase', lastFour: '4821', type: 'credit_card' })
    const docId = createDocument(db, 'statement.pdf', '/tmp/statement.pdf', 'hash1')

    // Simulate what pipeline does after extraction
    const found = findAccountByInstitutionAndLastFour(db, 'Chase', '4821')
    expect(found).toBeDefined()
    assignDocumentToAccount(db, docId, found!.id)

    const doc = db.prepare('SELECT account_id FROM documents WHERE id = ?').get(docId) as { account_id: number }
    expect(doc.account_id).toBe(accId)
  })

  it('creates new account when no match found', () => {
    const docId = createDocument(db, 'new.pdf', '/tmp/new.pdf', 'hash2')
    const found = findAccountByInstitutionAndLastFour(db, 'Amex', '1234')
    expect(found).toBeUndefined()

    const accId = createAccount(db, { name: 'Amex Gold', institution: 'Amex', lastFour: '1234', type: 'credit_card' })
    assignDocumentToAccount(db, docId, accId)

    const accounts = listAccountsWithCompleteness(db)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Amex Gold')
  })

  it('completeness grid shows missing months correctly', () => {
    const accId = createAccount(db, { name: 'Chase', institution: 'Chase', lastFour: '4821', type: 'credit_card' })

    // Create two documents for Jan and Mar (Feb missing)
    const doc1 = createDocument(db, 'jan.pdf', '/tmp/jan.pdf', 'h1')
    const doc2 = createDocument(db, 'mar.pdf', '/tmp/mar.pdf', 'h2')
    assignDocumentToAccount(db, doc1, accId)
    assignDocumentToAccount(db, doc2, accId)
    db.prepare('UPDATE documents SET status = ? WHERE id IN (?, ?)').run('completed', doc1, doc2)

    const catId = db.prepare('SELECT id FROM categories LIMIT 1').get() as { id: number }
    const insert = db.prepare('INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)')
    insert.run(doc1, '2025-01-10', 'Test', 50, 'debit', catId.id)
    insert.run(doc1, '2025-01-20', 'Test2', 30, 'debit', catId.id)
    insert.run(doc2, '2025-03-05', 'Test3', 25, 'debit', catId.id)

    const accounts = listAccountsWithCompleteness(db)
    expect(accounts[0].months['2025-01']).toBe('complete')
    expect(accounts[0].months['2025-02']).toBe('missing')
    expect(accounts[0].months['2025-03']).toBe('complete')
  })
})
```

**Step 2: Run the test**

Run: `npm test -- src/__tests__/lib/pipeline-accounts.test.ts`
Expected: All pass

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/__tests__/lib/pipeline-accounts.test.ts
git commit -m "test(accounts): add integration tests for account detection and completeness"
```
