# Merchant Split & Merge Prevention — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the ability to split incorrectly merged merchants, show transaction details before merging, and improve LLM prompts to prevent over-aggressive merchant collapsing.

**Architecture:** Expand the merchants page with two-level drill-down (description groups → individual transactions). Add a split API that updates `normalized_merchant` on selected transactions. Improve merge UX with description-group preview. Fix LLM normalization and suggest-merges prompts.

**Tech Stack:** Next.js App Router, SQLite (better-sqlite3), React, shadcn/ui, Anthropic/OpenAI LLM providers

---

### Task 1: DB — Add `getMerchantDescriptionGroups` query

**Files:**
- Modify: `src/lib/db/merchants.ts`
- Test: `src/__tests__/lib/db/merchants.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/lib/db/merchants.test.ts`, add a new describe block:

```ts
import { getAllMerchants, getMerchantDescriptionGroups } from '@/lib/db/merchants'

// ... existing tests ...

describe('getMerchantDescriptionGroups', () => {
  it('returns description groups for a merchant', () => {
    const groups = getMerchantDescriptionGroups(db, 'Netflix')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({
      description: 'NETFLIX.COM',
      transactionCount: 3,
      totalAmount: expect.closeTo(47.97),
      firstDate: '2025-01-15',
      lastDate: '2025-03-15',
    })
  })

  it('returns multiple groups when descriptions differ', () => {
    // Add transactions with different descriptions under one merchant
    const docId = db.prepare("SELECT id FROM documents LIMIT 1").get() as { id: number }
    const catId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-04-01', 'Acme Corp ACH', 100.00, 'debit', catId.id, docId.id, 'Acme Corp')
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-04-15', 'Acme Corp ACH', 100.00, 'debit', catId.id, docId.id, 'Acme Corp')
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-05-01', 'ACME CREDIT CARD EPAY', 50.00, 'debit', catId.id, docId.id, 'Acme Corp')

    const groups = getMerchantDescriptionGroups(db, 'Acme Corp')
    expect(groups).toHaveLength(2)
    // Sorted by count desc
    expect(groups[0].description).toBe('Acme Corp ACH')
    expect(groups[0].transactionCount).toBe(2)
    expect(groups[1].description).toBe('ACME CREDIT CARD EPAY')
    expect(groups[1].transactionCount).toBe(1)
  })

  it('returns empty array for unknown merchant', () => {
    const groups = getMerchantDescriptionGroups(db, 'Unknown Merchant')
    expect(groups).toEqual([])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/merchants.test.ts`
Expected: FAIL — `getMerchantDescriptionGroups` does not exist.

**Step 3: Write the implementation**

In `src/lib/db/merchants.ts`, add:

```ts
export interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

export function getMerchantDescriptionGroups(db: Database.Database, merchant: string): DescriptionGroup[] {
  return db.prepare(`
    SELECT
      description,
      COUNT(*) as transactionCount,
      ROUND(SUM(amount), 2) as totalAmount,
      MIN(date) as firstDate,
      MAX(date) as lastDate
    FROM transactions
    WHERE normalized_merchant = ?
    GROUP BY description
    ORDER BY COUNT(*) DESC
  `).all([merchant]) as DescriptionGroup[]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/merchants.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/db/merchants.ts src/__tests__/lib/db/merchants.test.ts
git commit -m "feat: add getMerchantDescriptionGroups query for merchant split"
```

---

### Task 2: DB — Add `getMerchantTransactions` and `splitMerchant` functions

**Files:**
- Modify: `src/lib/db/merchants.ts`
- Test: `src/__tests__/lib/db/merchants.test.ts`

**Step 1: Write the failing tests**

Add to `src/__tests__/lib/db/merchants.test.ts`:

```ts
import { getAllMerchants, getMerchantDescriptionGroups, getMerchantTransactions, splitMerchant } from '@/lib/db/merchants'

// ... existing tests ...

describe('getMerchantTransactions', () => {
  it('returns individual transactions for a merchant', () => {
    const txns = getMerchantTransactions(db, 'Netflix')
    expect(txns).toHaveLength(3)
    expect(txns[0]).toMatchObject({
      id: expect.any(Number),
      date: '2025-03-15',
      description: 'NETFLIX.COM',
      amount: 15.99,
    })
  })

  it('filters by description when provided', () => {
    // seed a second description group first
    const docId = db.prepare("SELECT id FROM documents LIMIT 1").get() as { id: number }
    const catId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }
    db.prepare("INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)").run('2025-04-01', 'Netflix Renewal', 20.00, 'debit', catId.id, docId.id, 'Netflix')

    const txns = getMerchantTransactions(db, 'Netflix', 'Netflix Renewal')
    expect(txns).toHaveLength(1)
    expect(txns[0].description).toBe('Netflix Renewal')
  })
})

describe('splitMerchant', () => {
  it('updates normalized_merchant on selected transactions', () => {
    const txns = getMerchantTransactions(db, 'Netflix')
    const idsToSplit = [txns[0].id, txns[1].id]

    const updated = splitMerchant(db, idsToSplit, 'Netflix Premium')

    expect(updated).toBe(2)

    const remaining = getMerchantTransactions(db, 'Netflix')
    expect(remaining).toHaveLength(1)

    const split = getMerchantTransactions(db, 'Netflix Premium')
    expect(split).toHaveLength(2)
  })

  it('returns 0 for empty transaction IDs', () => {
    expect(splitMerchant(db, [], 'New Name')).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/db/merchants.test.ts`
Expected: FAIL — functions not found.

**Step 3: Write the implementation**

Add to `src/lib/db/merchants.ts`:

```ts
export interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

export function getMerchantTransactions(db: Database.Database, merchant: string, description?: string): MerchantTransaction[] {
  let sql = 'SELECT id, date, description, amount FROM transactions WHERE normalized_merchant = ?'
  const params: unknown[] = [merchant]
  if (description) {
    sql += ' AND description = ?'
    params.push(description)
  }
  sql += ' ORDER BY date DESC'
  return db.prepare(sql).all(params) as MerchantTransaction[]
}

export function splitMerchant(db: Database.Database, transactionIds: number[], newMerchant: string): number {
  if (transactionIds.length === 0) return 0
  const placeholders = transactionIds.map(() => '?').join(', ')
  const result = db.prepare(
    `UPDATE transactions SET normalized_merchant = ? WHERE id IN (${placeholders})`
  ).run(newMerchant, ...transactionIds)
  return result.changes
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/db/merchants.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/db/merchants.ts src/__tests__/lib/db/merchants.test.ts
git commit -m "feat: add getMerchantTransactions and splitMerchant DB functions"
```

---

### Task 3: API — Add merchant detail and split endpoints

**Files:**
- Create: `src/app/api/merchants/[merchant]/route.ts`
- Create: `src/app/api/merchants/split/route.ts`

**Step 1: Create merchant detail endpoint**

Create `src/app/api/merchants/[merchant]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getMerchantDescriptionGroups, getMerchantTransactions } from '@/lib/db/merchants'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ merchant: string }> }
) {
  const { merchant } = await params
  const decoded = decodeURIComponent(merchant)
  const description = request.nextUrl.searchParams.get('description') || undefined

  const db = getDb()

  if (description) {
    const transactions = getMerchantTransactions(db, decoded, description)
    return NextResponse.json({ transactions })
  }

  const groups = getMerchantDescriptionGroups(db, decoded)
  return NextResponse.json({ groups })
}
```

**Step 2: Create split endpoint**

Create `src/app/api/merchants/split/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { splitMerchant } from '@/lib/db/merchants'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { transactionIds, newMerchant } = body ?? {}

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return NextResponse.json({ error: 'transactionIds array required' }, { status: 400 })
  }
  if (!transactionIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
    return NextResponse.json({ error: 'All transactionIds must be integers' }, { status: 400 })
  }
  if (typeof newMerchant !== 'string' || !newMerchant.trim()) {
    return NextResponse.json({ error: 'newMerchant name is required' }, { status: 400 })
  }

  const db = getDb()
  const updated = splitMerchant(db, transactionIds, newMerchant.trim())
  return NextResponse.json({ updated })
}
```

**Step 3: Commit**

```bash
git add "src/app/api/merchants/[merchant]/route.ts" src/app/api/merchants/split/route.ts
git commit -m "feat: add merchant detail and split API endpoints"
```

---

### Task 4: API — Add merge preview endpoint

Returns description groups for multiple merchants at once (used in the merge dialog to show what patterns will be collapsed).

**Files:**
- Create: `src/app/api/merchants/merge-preview/route.ts`

**Step 1: Create the endpoint**

Create `src/app/api/merchants/merge-preview/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getMerchantDescriptionGroups } from '@/lib/db/merchants'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { merchants } = body ?? {}

  if (!Array.isArray(merchants) || merchants.length === 0) {
    return NextResponse.json({ error: 'merchants array required' }, { status: 400 })
  }

  const db = getDb()
  const preview: Record<string, { description: string; transactionCount: number; totalAmount: number }[]> = {}
  for (const merchant of merchants) {
    if (typeof merchant === 'string') {
      preview[merchant] = getMerchantDescriptionGroups(db, merchant)
    }
  }

  return NextResponse.json({ preview })
}
```

**Step 2: Commit**

```bash
git add src/app/api/merchants/merge-preview/route.ts
git commit -m "feat: add merge-preview API for description group preview"
```

---

### Task 5: UI — Add expandable merchant rows (Level 1: description groups)

**Files:**
- Modify: `src/app/(app)/merchants/page.tsx`

This is a significant UI change. The merchant table rows become expandable. Clicking a row (outside checkbox) toggles expand to show description groups. The checkbox column still handles selection for merge.

**Step 1: Add expand state and fetch logic**

In `src/app/(app)/merchants/page.tsx`, add the following state and types:

```ts
// New interfaces at top of file
interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

// New state inside component
const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
const [descriptionGroups, setDescriptionGroups] = useState<DescriptionGroup[]>([])
const [loadingGroups, setLoadingGroups] = useState(false)
```

Add a function to fetch description groups:

```ts
const fetchDescriptionGroups = (merchant: string) => {
  setLoadingGroups(true)
  fetch(`/api/merchants/${encodeURIComponent(merchant)}`)
    .then(r => r.json())
    .then(d => {
      setDescriptionGroups(d.groups || [])
      setLoadingGroups(false)
    })
    .catch(() => { setLoadingGroups(false) })
}

const toggleExpand = (merchant: string) => {
  if (expandedMerchant === merchant) {
    setExpandedMerchant(null)
    setDescriptionGroups([])
  } else {
    setExpandedMerchant(merchant)
    fetchDescriptionGroups(merchant)
  }
}
```

**Step 2: Update the table row click handler**

Change the `<TableRow>` click from `toggleSelect` to `toggleExpand`. Move selection to checkbox only:

```tsx
<TableRow
  key={m.merchant}
  className="cursor-pointer"
  onClick={() => toggleExpand(m.merchant)}
>
  <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
    <Checkbox
      checked={selectedMerchants.has(m.merchant)}
      onCheckedChange={() => toggleSelect(m.merchant)}
    />
  </TableCell>
  {/* ... rest of cells unchanged ... */}
</TableRow>
```

**Step 3: Add the expandable description groups sub-row**

After each `<TableRow>`, conditionally render the description groups:

```tsx
{expandedMerchant === m.merchant && (
  <TableRow>
    <TableCell colSpan={6} className="p-0">
      <div className="bg-muted/30 px-8 py-2 space-y-1">
        {loadingGroups ? (
          <div className="flex justify-center py-3">
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : descriptionGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No transaction details found.</p>
        ) : (
          descriptionGroups.map(g => (
            <div key={g.description} className="flex items-center gap-3 py-1 text-xs">
              <Checkbox
                checked={selectedDescriptionGroups.has(g.description)}
                onCheckedChange={() => toggleDescriptionGroup(g.description, g)}
                onClick={e => e.stopPropagation()}
              />
              <span className="font-medium flex-1 min-w-0 truncate">{g.description}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{g.transactionCount} txns</span>
              <span className="tabular-nums shrink-0">{formatCurrencyPrecise(g.totalAmount)}</span>
              <span className="text-muted-foreground tabular-nums shrink-0">{g.firstDate} — {g.lastDate}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); toggleExpandGroup(g.description) }}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${expandedGroup === g.description ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          ))
        )}
      </div>
    </TableCell>
  </TableRow>
)}
```

**Step 4: Add description group selection state**

```ts
// State for selecting description groups within an expanded merchant
const [selectedDescriptionGroups, setSelectedDescriptionGroups] = useState<Map<string, DescriptionGroup>>(new Map())

const toggleDescriptionGroup = (description: string, group: DescriptionGroup) => {
  setSelectedDescriptionGroups(prev => {
    const next = new Map(prev)
    if (next.has(description)) next.delete(description)
    else next.set(description, group)
    return next
  })
}
```

**Step 5: Add ChevronDown import**

Add `ChevronDown` to the lucide-react imports at the top of the file.

**Step 6: Commit**

```bash
git add "src/app/(app)/merchants/page.tsx"
git commit -m "feat: add expandable merchant rows with description groups"
```

---

### Task 6: UI — Add Level 2 drill-down (individual transactions within a group)

**Files:**
- Modify: `src/app/(app)/merchants/page.tsx`

**Step 1: Add expand-group state and fetch logic**

```ts
interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
const [groupTransactions, setGroupTransactions] = useState<MerchantTransaction[]>([])
const [loadingTransactions, setLoadingTransactions] = useState(false)
const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set())

const toggleExpandGroup = (description: string) => {
  if (expandedGroup === description) {
    setExpandedGroup(null)
    setGroupTransactions([])
  } else {
    setExpandedGroup(description)
    setLoadingTransactions(true)
    fetch(`/api/merchants/${encodeURIComponent(expandedMerchant!)}?description=${encodeURIComponent(description)}`)
      .then(r => r.json())
      .then(d => {
        setGroupTransactions(d.transactions || [])
        setLoadingTransactions(false)
      })
      .catch(() => { setLoadingTransactions(false) })
  }
}

const toggleTransactionSelect = (id: number) => {
  setSelectedTransactionIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
```

**Step 2: Render individual transactions under each group**

Below each description group row (inside the description groups map), add:

```tsx
{expandedGroup === g.description && (
  <div className="ml-6 pl-4 border-l border-border space-y-0.5 py-1">
    {loadingTransactions ? (
      <div className="flex justify-center py-2">
        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    ) : groupTransactions.map(t => (
      <div key={t.id} className="flex items-center gap-3 py-0.5 text-xs text-muted-foreground">
        <Checkbox
          checked={selectedTransactionIds.has(t.id)}
          onCheckedChange={() => toggleTransactionSelect(t.id)}
          onClick={e => e.stopPropagation()}
        />
        <span className="tabular-nums shrink-0">{t.date}</span>
        <span className="flex-1 min-w-0 truncate">{t.description}</span>
        <span className="tabular-nums shrink-0">{formatCurrencyPrecise(t.amount)}</span>
      </div>
    ))}
  </div>
)}
```

**Step 3: Reset selections when collapsing**

When `toggleExpand` collapses a merchant, also clear group/transaction selections:

```ts
const toggleExpand = (merchant: string) => {
  if (expandedMerchant === merchant) {
    setExpandedMerchant(null)
    setDescriptionGroups([])
    setExpandedGroup(null)
    setGroupTransactions([])
    setSelectedDescriptionGroups(new Map())
    setSelectedTransactionIds(new Set())
  } else {
    setExpandedMerchant(merchant)
    setExpandedGroup(null)
    setGroupTransactions([])
    setSelectedDescriptionGroups(new Map())
    setSelectedTransactionIds(new Set())
    fetchDescriptionGroups(merchant)
  }
}
```

**Step 4: Commit**

```bash
git add "src/app/(app)/merchants/page.tsx"
git commit -m "feat: add Level 2 transaction drill-down in expanded merchant rows"
```

---

### Task 7: UI — Add split button and split dialog

**Files:**
- Modify: `src/app/(app)/merchants/page.tsx`

**Step 1: Add split state**

```ts
const [splitDialogOpen, setSplitDialogOpen] = useState(false)
const [splitName, setSplitName] = useState('')
const [splitting, setSplitting] = useState(false)
```

**Step 2: Compute selected transaction IDs for split**

The split should gather IDs from two sources: selected description groups (all transactions in those groups) and individually selected transactions.

```ts
// Helper to get all transaction IDs from selected description groups
const getGroupTransactionIds = async (): Promise<number[]> => {
  if (selectedDescriptionGroups.size === 0) return []
  const ids: number[] = []
  for (const desc of selectedDescriptionGroups.keys()) {
    const res = await fetch(`/api/merchants/${encodeURIComponent(expandedMerchant!)}?description=${encodeURIComponent(desc)}`)
    const data = await res.json()
    ids.push(...(data.transactions || []).map((t: MerchantTransaction) => t.id))
  }
  return ids
}

const hasSplitSelection = selectedDescriptionGroups.size > 0 || selectedTransactionIds.size > 0
```

**Step 3: Add Split button to the sticky selection bar**

Update the sticky selection bar to show a Split button when there's a split-level selection (groups or transactions selected within an expanded merchant):

```tsx
{/* Sticky selection bar */}
{(selectedMerchants.size >= 1 || hasSplitSelection) && (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
    {hasSplitSelection ? (
      <>
        <span className="text-xs text-muted-foreground">
          {selectedDescriptionGroups.size > 0 ? `${selectedDescriptionGroups.size} group(s)` : `${selectedTransactionIds.size} transaction(s)`} selected
        </span>
        <Button size="sm" className="h-7 text-xs" onClick={() => setSplitDialogOpen(true)}>
          <Scissors className="h-3.5 w-3.5 mr-1" />
          Split
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => {
          setSelectedDescriptionGroups(new Map())
          setSelectedTransactionIds(new Set())
        }}>
          Clear
        </Button>
      </>
    ) : (
      <>
        <span className="text-xs text-muted-foreground">{selectedMerchants.size} selected</span>
        {selectedMerchants.size >= 2 && (
          <Button size="sm" className="h-7 text-xs" onClick={openMergeDialog}>
            <Merge className="h-3.5 w-3.5 mr-1" />
            Merge
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedMerchants(new Set())}>
          Clear
        </Button>
      </>
    )}
  </div>
)}
```

**Step 4: Add Scissors import**

Add `Scissors` to the lucide-react imports.

**Step 5: Add split dialog**

```tsx
{/* Split Dialog */}
<Dialog open={splitDialogOpen} onOpenChange={setSplitDialogOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Split Merchant</DialogTitle>
    </DialogHeader>
    <p className="text-xs text-muted-foreground mb-3">
      Enter a new merchant name for the selected transactions.
    </p>
    <Input
      value={splitName}
      onChange={e => setSplitName(e.target.value)}
      placeholder="New merchant name"
      className="h-8 text-sm"
      autoFocus
    />
    <DialogFooter>
      <Button variant="ghost" size="sm" onClick={() => setSplitDialogOpen(false)}>Cancel</Button>
      <Button
        size="sm"
        disabled={splitting || !splitName.trim()}
        onClick={handleSplit}
      >
        {splitting ? 'Splitting...' : 'Split'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 6: Implement handleSplit**

```ts
const handleSplit = async () => {
  setSplitting(true)
  try {
    // Collect all transaction IDs to split
    const groupIds = await getGroupTransactionIds()
    const allIds = [...new Set([...groupIds, ...selectedTransactionIds])]

    if (allIds.length === 0) {
      setSplitting(false)
      return
    }

    const res = await fetch('/api/merchants/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionIds: allIds, newMerchant: splitName.trim() }),
    })

    if (res.ok) {
      setSplitDialogOpen(false)
      setSplitName('')
      setSelectedDescriptionGroups(new Map())
      setSelectedTransactionIds(new Set())
      setExpandedMerchant(null)
      setDescriptionGroups([])
      fetchMerchants(search || undefined)
    }
  } catch {
    // ignore
  } finally {
    setSplitting(false)
  }
}
```

**Step 7: Commit**

```bash
git add "src/app/(app)/merchants/page.tsx"
git commit -m "feat: add split button and dialog for merchant splitting"
```

---

### Task 8: UI — Add merge preview to merge dialog

**Files:**
- Modify: `src/app/(app)/merchants/page.tsx`

**Step 1: Add merge preview state and fetch**

```ts
const [mergePreview, setMergePreview] = useState<Record<string, { description: string; transactionCount: number; totalAmount: number }[]>>({})
const [loadingPreview, setLoadingPreview] = useState(false)
```

**Step 2: Fetch preview when merge dialog opens**

Update `openMergeDialog` to also fetch the preview:

```ts
const openMergeDialog = () => {
  const selected = Array.from(selectedMerchants)
  setMergeTarget(selected[0])
  setCustomTarget('')
  setMergeDialogOpen(true)
  setLoadingPreview(true)
  fetch('/api/merchants/merge-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchants: selected }),
  })
    .then(r => r.json())
    .then(d => {
      setMergePreview(d.preview || {})
      setLoadingPreview(false)
    })
    .catch(() => { setLoadingPreview(false) })
}
```

**Step 3: Render the preview in merge dialog**

After the radio buttons in the merge dialog, before `<DialogFooter>`, add:

```tsx
{/* Description group preview */}
{!loadingPreview && Object.keys(mergePreview).length > 0 && (
  <div className="mt-3 border-t pt-3">
    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Transaction patterns being merged</p>
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {Object.entries(mergePreview).map(([merchant, groups]) => (
        <div key={merchant}>
          <p className="text-xs font-medium mb-0.5">{merchant}</p>
          {groups.map(g => (
            <div key={g.description} className="flex items-center gap-2 text-[11px] text-muted-foreground pl-3">
              <span className="flex-1 truncate">{g.description}</span>
              <span className="tabular-nums shrink-0">{g.transactionCount} txns</span>
              <span className="tabular-nums shrink-0">{formatCurrencyPrecise(g.totalAmount)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
)}
{loadingPreview && (
  <div className="mt-3 flex justify-center py-2">
    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
  </div>
)}
```

**Step 4: Commit**

```bash
git add "src/app/(app)/merchants/page.tsx"
git commit -m "feat: add description group preview to merge dialog"
```

---

### Task 9: LLM — Improve normalization prompt to distinguish financial products

**Files:**
- Modify: `src/lib/llm/prompts/normalization.ts`

**Step 1: Update both provider prompts**

In the `SPECIFIC RULES` / `## Specific Rules` section of both anthropic and openai prompts, add this rule:

```
- Treat different financial products from the same institution as SEPARATE merchants. Mortgage payments (ACH), credit card payments (ePay/AutoPay), and loan payments from the same bank are different merchants (e.g. "JPMorgan Chase ACH" → "JPMorgan Chase Mortgage", "Chase Credit Card ePay" → "Chase Credit Card")
```

For the **anthropic** prompt, add after the `- Collapse apostrophe/accent variants` line.
For the **openai** prompt, add after the same line.

**Step 2: Commit**

```bash
git add src/lib/llm/prompts/normalization.ts
git commit -m "fix: improve normalization prompt to distinguish financial products from same institution"
```

---

### Task 10: LLM — Fix suggest-merges prompt

**Files:**
- Modify: `src/lib/llm/suggest-merges.ts`

**Step 1: Update the suggest-merges prompt**

In `suggestMerchantMerges`, update the user message content. Replace:

```
Identify groups where multiple names refer to the SAME business (e.g. "Chase" and "JPMorgan Chase", or "The Cincinnati Insurance" and "Cincinnati Insurance").
```

With:

```
Identify groups where multiple names refer to the SAME business (e.g. "The Cincinnati Insurance" and "Cincinnati Insurance", or "Costco" and "Costco Wholesale").

IMPORTANT: Do NOT merge different financial products from the same institution. Mortgage payments, credit card payments, and loan payments are separate merchants even if they share a bank name (e.g. "JPMorgan Chase Mortgage" and "Chase Credit Card" should NOT be merged).
```

**Step 2: Commit**

```bash
git add src/lib/llm/suggest-merges.ts
git commit -m "fix: update suggest-merges prompt to not merge different financial products"
```

---

### Task 11: Fix the user's data — split JPMorgan Chase credit card payments

This is a one-time data fix using the new split endpoint.

**Step 1: Verify the split works via dev server**

Run the dev server, navigate to `/merchants`, find "JPMorgan Chase", expand it, and verify the description groups show:
- "JPMorgan Chase ACH" variants (the mortgage — $2,240.42 each)
- "Chase Credit Card ePay/AutoPay" variants (the credit card payments)

**Step 2: Select the credit card payment groups and split them**

Select all the credit card ePay/AutoPay description groups, click Split, enter "Chase Credit Card" as the new merchant name, and confirm.

**Step 3: Verify the split result**

- "JPMorgan Chase" should now only contain the $2,240.42 ACH mortgage payments
- "Chase Credit Card" should contain all the ePay/AutoPay transactions
- Check the commitments page to verify the mortgage still shows as a commitment

**Step 4: Recategorize if needed**

The credit card payments are transfers (paying off a credit card). They may need to be recategorized from "Rent & Mortgage" to "Transfer" via the transactions page.

No commit needed — this is a data operation.

---

### Task 12: Run full test suite and lint

**Step 1: Run tests**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Fix any issues, then commit**

If there are lint or test failures, fix them and commit.

---

### Task 13: Final commit — squash if needed

Review the full set of commits. If requested, squash into a single feature commit:

```bash
git log --oneline -15
```

If squashing:

```bash
git reset --soft <commit-before-first-task>
git commit -m "feat: merchant split, expandable rows, merge prevention, and LLM prompt improvements"
```
