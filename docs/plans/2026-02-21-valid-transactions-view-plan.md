# valid_transactions View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the opt-in `VALID_TRANSACTION_FILTER` constant with a SQL view that bakes in all transaction filters and pre-joins categories, making it impossible to write queries that forget the filters.

**Architecture:** Create `valid_transactions` view in schema (DROP+CREATE on startup). Migrate all spending/report queries to use the view. Remove `VALID_TRANSACTION_FILTER` constant and `filters.ts`. Add a view correctness test and a lint test that greps migrated files for raw `FROM transactions`.

**Tech Stack:** SQLite views, better-sqlite3, Vitest

---

### Task 1: Create the view in schema + view correctness test

**Files:**
- Modify: `src/lib/db/schema.ts:397-399` (add view after seed data)
- Create: `src/__tests__/lib/db/valid-transactions-view.test.ts`

**Step 1: Write the view correctness test**

Create `src/__tests__/lib/db/valid-transactions-view.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions } from '@/lib/db/transactions'
import { createFlag } from '@/lib/db/transaction-flags'

describe('valid_transactions view', () => {
  function createDb() {
    const db = new Database(':memory:')
    initializeSchema(db)
    return db
  }

  it('excludes flagged-removed transactions', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Normal Purchase', amount: 100, type: 'debit' },
      { date: '2025-01-16', description: 'Duplicate', amount: 200, type: 'debit' },
    ])
    const txns = db.prepare('SELECT id FROM transactions ORDER BY date').all() as Array<{ id: number }>
    // Flag second as removed duplicate
    const flagId = createFlag(db, txns[1].id, 'duplicate')
    db.prepare("UPDATE transaction_flags SET resolution = 'removed' WHERE id = ?").run(flagId)

    const rows = db.prepare('SELECT description FROM valid_transactions').all() as Array<{ description: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Normal Purchase')
  })

  it('excludes transfer categories (exclude_from_totals)', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    const transferCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Transfer'").get() as { id: number }).id
    const groceryCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id

    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Groceries', amount: 50, type: 'debit' },
    ])
    db.prepare('UPDATE transactions SET category_id = ? WHERE description = ?').run(groceryCatId, 'Groceries')

    // Insert a transfer manually
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, category_id)
      VALUES (?, '2025-01-16', 'Wire Transfer', 500, 'debit', ?)`).run(docId, transferCatId)

    const rows = db.prepare('SELECT description FROM valid_transactions').all() as Array<{ description: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Groceries')
  })

  it('excludes payment/transfer transaction classes', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Normal', amount: 100, type: 'debit' },
    ])
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, transaction_class)
      VALUES (?, '2025-01-16', 'CC Payment', 500, 'debit', 'payment')`).run(docId)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, transaction_class)
      VALUES (?, '2025-01-17', 'Bank Transfer', 1000, 'debit', 'transfer')`).run(docId)

    const rows = db.prepare('SELECT description FROM valid_transactions').all() as Array<{ description: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Normal')
  })

  it('includes category columns from join', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    const catId = (db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods', amount: 100, type: 'debit' },
    ])
    db.prepare('UPDATE transactions SET category_id = ? WHERE description = ?').run(catId, 'Whole Foods')

    const row = db.prepare('SELECT category_name, category_color, category_group FROM valid_transactions').get() as Record<string, string>
    expect(row.category_name).toBe('Groceries')
    expect(row.category_color).toBeTruthy()
    expect(row.category_group).toBe('Food & Drink')
  })

  it('includes uncategorized transactions with null category fields', () => {
    const db = createDb()
    const docId = createDocument(db, 'test.pdf', '/tmp/test.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Unknown Charge', amount: 25, type: 'debit' },
    ])

    const row = db.prepare('SELECT category_name, category_color, category_group FROM valid_transactions').get() as Record<string, string | null>
    expect(row.category_name).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/lib/db/valid-transactions-view.test.ts`
Expected: FAIL — `valid_transactions` view does not exist

**Step 3: Add the view to schema.ts**

At the very end of `initializeSchema()` in `src/lib/db/schema.ts`, just before the closing `}`, add:

```typescript
  // valid_transactions view — pre-filters and pre-joins categories
  // DROP+CREATE so schema changes propagate on restart
  db.exec('DROP VIEW IF EXISTS valid_transactions')
  db.exec(`
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
      )
  `)
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/lib/db/valid-transactions-view.test.ts`
Expected: All 5 tests PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All 283+ tests PASS (view creation is additive, nothing breaks)

**Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/__tests__/lib/db/valid-transactions-view.test.ts
git commit -m "feat: add valid_transactions view to schema with correctness tests"
```

---

### Task 2: Migrate reports.ts

**Files:**
- Modify: `src/lib/db/reports.ts`
- Test: `src/__tests__/lib/db/reports.test.ts` (existing — should still pass)

**Step 1: Migrate all queries in reports.ts**

In `src/lib/db/reports.ts`:

1. Remove the import: `import { VALID_TRANSACTION_FILTER } from './filters'`

2. `getSpendingSummary` — the totals query currently uses `CASE WHEN t.type = 'debit' AND ${VALID_TRANSACTION_FILTER}` over raw `transactions`. With the view, the filtering is already done, so simplify:

```typescript
export function getSpendingSummary(db: Database.Database, filters: ReportFilters): SpendingSummary {
  const { where, params } = buildWhere(filters)

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as totalSpent,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as totalIncome
    FROM valid_transactions t
    ${where}
  `).get(params) as { totalSpent: number; totalIncome: number }

  const monthCount = db.prepare(`
    SELECT COUNT(DISTINCT strftime('%Y-%m', t.date)) as months
    FROM valid_transactions t
    ${where}
  `).get(params) as { months: number }

  const avgMonthly = monthCount.months > 0
    ? Math.round((totals.totalSpent / monthCount.months) * 100) / 100
    : 0

  const debitFilters = { ...filters, type: 'debit' as const }
  const { where: debitWhere, params: debitParams } = buildWhere(debitFilters)

  const topCat = db.prepare(`
    SELECT t.category_name as name, SUM(t.amount) as amount
    FROM valid_transactions t
    ${debitWhere}
    GROUP BY t.category_id
    ORDER BY amount DESC
    LIMIT 1
  `).get(debitParams) as { name: string; amount: number } | undefined

  return {
    totalSpent: totals.totalSpent,
    totalIncome: totals.totalIncome,
    avgMonthly,
    topCategory: topCat ?? { name: 'None', amount: 0 },
  }
}
```

3. `getSpendingOverTime` — replace `FROM transactions t LEFT JOIN categories c ... AND ${VALID_TRANSACTION_FILTER}`:

```typescript
export function getSpendingOverTime(
  db: Database.Database,
  filters: ReportFilters,
  groupBy: 'month' | 'quarter' | 'year'
): SpendingOverTimeRow[] {
  const debitFilters = { ...filters, type: filters.type ?? 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  let periodExpr: string
  switch (groupBy) {
    case 'month':
      periodExpr = "strftime('%Y-%m', t.date)"
      break
    case 'quarter':
      periodExpr = "strftime('%Y', t.date) || '-Q' || ((cast(strftime('%m', t.date) as integer) - 1) / 3 + 1)"
      break
    case 'year':
      periodExpr = "strftime('%Y', t.date)"
      break
  }

  return db.prepare(`
    SELECT ${periodExpr} as period, SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingOverTimeRow[]
}
```

4. `getCategoryBreakdown`:

```typescript
export function getCategoryBreakdown(db: Database.Database, filters: ReportFilters): CategoryBreakdownRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  const rows = db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY t.category_id
    ORDER BY amount DESC
  `).all(params) as Array<{ category: string; color: string; amount: number }>

  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return rows.map(r => ({
    ...r,
    percentage: total > 0 ? Math.round((r.amount / total) * 10000) / 100 : 0,
  }))
}
```

5. `getSpendingTrend`:

```typescript
export function getSpendingTrend(db: Database.Database, filters: ReportFilters): SpendingTrendRow[] {
  const { type: _type, ...filtersWithoutType } = filters // eslint-disable-line @typescript-eslint/no-unused-vars
  const { where, params } = buildWhere(filtersWithoutType)

  return db.prepare(`
    SELECT
      strftime('%Y-%m', t.date) as period,
      COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) as debits,
      COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) as credits
    FROM valid_transactions t
    ${where}
    GROUP BY period
    ORDER BY period ASC
  `).all(params) as SpendingTrendRow[]
}
```

6. `getSankeyData`:

```typescript
export function getSankeyData(db: Database.Database, filters: ReportFilters): SankeyRow[] {
  const debitFilters = { ...filters, type: 'debit' as const }
  const { where, params } = buildWhere(debitFilters)

  return db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_group, 'Other') as category_group,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    GROUP BY t.category_id
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(params) as SankeyRow[]
}
```

7. `getSankeyIncomeData`:

```typescript
export function getSankeyIncomeData(db: Database.Database, filters: ReportFilters): SankeyRow[] {
  const creditFilters = { ...filters, type: 'credit' as const }
  const { where, params } = buildWhere(creditFilters)

  return db.prepare(`
    SELECT
      COALESCE(t.category_name, 'Uncategorized') as category,
      COALESCE(t.category_group, 'Other') as category_group,
      COALESCE(t.category_color, '#9CA3AF') as color,
      SUM(t.amount) as amount
    FROM valid_transactions t
    ${where}
    HAVING amount > 0
    ORDER BY amount DESC
  `).all(params) as SankeyRow[]
}
```

8. `getMoMComparison`:

```typescript
export function getMoMComparison(db: Database.Database, filters: ReportFilters): MoMComparisonRow[] {
  const { type: _type, ...filtersWithoutType } = filters // eslint-disable-line @typescript-eslint/no-unused-vars
  const { where, params } = buildWhere(filtersWithoutType)

  const months = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', t.date) as month
    FROM valid_transactions t
    ${where}
    ORDER BY month DESC
    LIMIT 2
  `).all(params) as Array<{ month: string }>

  if (months.length < 2) return []

  const currentMonth = months[0].month
  const previousMonth = months[1].month

  const rows = db.prepare(`
    SELECT
      COALESCE(t.category_group, 'Other') as grp,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as current_amount,
      SUM(CASE WHEN strftime('%Y-%m', t.date) = ? THEN t.amount ELSE 0 END) as previous_amount
    FROM valid_transactions t
    ${where}${where ? ' AND' : ' WHERE'} t.type = 'debit'
      AND strftime('%Y-%m', t.date) IN (?, ?)
    GROUP BY COALESCE(t.category_group, 'Other')
    HAVING current_amount > 0 OR previous_amount > 0
  `).all([...params, currentMonth, previousMonth, currentMonth, previousMonth]) as Array<{ grp: string; current_amount: number; previous_amount: number }>

  return rows
    .map(r => {
      const delta = r.current_amount - r.previous_amount
      const percentChange = r.previous_amount > 0 ? Math.round((delta / r.previous_amount) * 1000) / 10 : (r.current_amount > 0 ? 100 : 0)
      return {
        group: r.grp,
        current: r.current_amount,
        previous: r.previous_amount,
        delta,
        percentChange,
      }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}
```

9. `getTopTransactions`:

```typescript
export function getTopTransactions(
  db: Database.Database,
  filters: ReportFilters,
  limit: number = 10
): TopTransactionRow[] {
  const { where, params } = buildWhere(filters)

  return db.prepare(`
    SELECT t.id, t.date, t.description, t.amount, t.type,
           t.category_name as category
    FROM valid_transactions t
    ${where}
    ORDER BY t.amount DESC
    LIMIT ?
  `).all([...params, limit]) as TopTransactionRow[]
}
```

**Step 2: Run existing report tests**

Run: `npm run test -- src/__tests__/lib/db/reports.test.ts src/__tests__/lib/db/reports-top-txn.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/db/reports.ts
git commit -m "refactor: migrate reports.ts to valid_transactions view"
```

---

### Task 3: Migrate health.ts

**Files:**
- Modify: `src/lib/db/health.ts`

**Step 1: Migrate the query**

In `src/lib/db/health.ts`:

1. Remove: `import { VALID_TRANSACTION_FILTER } from './filters'`

2. Replace the function body:

```typescript
export function getMonthlyIncomeVsSpending(db: Database.Database): MonthlyFlow[] {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', t.date) as month,
           SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) as income,
           SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END) as spending
    FROM valid_transactions t
    WHERE t.date >= date('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all() as Array<{ month: string; income: number; spending: number }>

  return rows.map(r => ({
    month: r.month,
    income: Math.round(r.income * 100) / 100,
    spending: Math.round(r.spending * 100) / 100,
    net: Math.round((r.income - r.spending) * 100) / 100,
  }))
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/db/health.ts
git commit -m "refactor: migrate health.ts to valid_transactions view"
```

---

### Task 4: Migrate commitments.ts

**Files:**
- Modify: `src/lib/db/commitments.ts:15-37`

**Step 1: Migrate getCommitments**

The conditions array currently has manual filter clauses. Replace with the view. Note: commitments also needs `excluded_commitment_transactions` which is separate from the view filters.

```typescript
export function getCommitments(db: Database.Database, filters: CommitmentFilters): CommitmentGroup[] {
  const conditions: string[] = ["t.type = 'debit'", "t.normalized_merchant IS NOT NULL", "t.id NOT IN (SELECT transaction_id FROM excluded_commitment_transactions)"]
  const params: unknown[] = []

  if (filters.start_date) {
    conditions.push('t.date >= ?')
    params.push(filters.start_date)
  }
  if (filters.end_date) {
    conditions.push('t.date <= ?')
    params.push(filters.end_date)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const rows = db.prepare(`
    SELECT t.id, t.date, t.description, t.normalized_merchant, t.amount, t.type,
           t.category_name, t.category_color
    FROM valid_transactions t
    ${where}
    ORDER BY t.date ASC
  `).all(params) as TransactionForCommitment[]

  const groups = detectCommitmentGroups(rows)
  if (filters.excludeMerchants && filters.excludeMerchants.size > 0) {
    return groups.filter(g => !filters.excludeMerchants!.has(g.merchantName))
  }
  return groups
}
```

Key changes:
- Removed `COALESCE(c.exclude_from_totals, 0) = 0` and `NOT EXISTS (... transaction_flags ...)` from conditions (view handles these)
- Replaced `FROM transactions t LEFT JOIN categories c ON t.category_id = c.id` with `FROM valid_transactions t`
- Changed `c.name as category_name, c.color as category_color` to `t.category_name, t.category_color`

**Step 2: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/db/commitments.ts
git commit -m "refactor: migrate commitments.ts to valid_transactions view"
```

---

### Task 5: Migrate merchants.ts

**Files:**
- Modify: `src/lib/db/merchants.ts`

**Step 1: Migrate all three query functions**

1. `getMerchantDescriptionGroups` — replace `FROM transactions t` + manual NOT EXISTS:

```typescript
export function getMerchantDescriptionGroups(db: Database.Database, merchant: string): DescriptionGroup[] {
  return db.prepare(`
    SELECT
      t.description,
      COUNT(*) as transactionCount,
      ROUND(SUM(t.amount), 2) as totalAmount,
      MIN(t.date) as firstDate,
      MAX(t.date) as lastDate
    FROM valid_transactions t
    WHERE t.normalized_merchant = ?
    GROUP BY t.description
    ORDER BY COUNT(*) DESC
  `).all([merchant]) as DescriptionGroup[]
}
```

2. `getMerchantTransactions` — replace raw query + manual NOT EXISTS:

```typescript
export function getMerchantTransactions(db: Database.Database, merchant: string, description?: string): MerchantTransaction[] {
  let sql = 'SELECT t.id, t.date, t.description, t.amount FROM valid_transactions t WHERE t.normalized_merchant = ?'
  const params: unknown[] = [merchant]
  if (description) {
    sql += ' AND t.description = ?'
    params.push(description)
  }
  sql += ' ORDER BY t.date DESC'
  return db.prepare(sql).all(params) as MerchantTransaction[]
}
```

3. `getAllMerchants` — replace `FROM transactions t LEFT JOIN categories c` + manual NOT EXISTS clauses:

```typescript
export function getAllMerchants(db: Database.Database, search?: string): MerchantInfo[] {
  let where = 'WHERE t.normalized_merchant IS NOT NULL'
  const params: unknown[] = []

  if (search) {
    where += ' AND t.normalized_merchant LIKE ?'
    params.push(`%${search}%`)
  }

  const rows = db.prepare(`
    SELECT
      t.normalized_merchant as merchant,
      COUNT(*) as transactionCount,
      ROUND(SUM(t.amount), 2) as totalAmount,
      MIN(t.date) as firstDate,
      MAX(t.date) as lastDate,
      c.name as categoryName,
      c.color as categoryColor
    FROM valid_transactions t
    LEFT JOIN categories c ON c.id = (
      SELECT t2.category_id FROM valid_transactions t2
      WHERE t2.normalized_merchant = t.normalized_merchant AND t2.category_id IS NOT NULL
      GROUP BY t2.category_id ORDER BY COUNT(*) DESC LIMIT 1
    )
    ${where}
    GROUP BY t.normalized_merchant
    ORDER BY COUNT(*) DESC
  `).all(params) as MerchantInfo[]

  return rows
}
```

Note: `splitMerchant` stays on raw `transactions` — it is a write operation (UPDATE).

**Step 2: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/lib/db/merchants.ts
git commit -m "refactor: migrate merchants.ts to valid_transactions view"
```

---

### Task 6: Migrate compact-data.ts

**Files:**
- Modify: `src/lib/insights/compact-data.ts`
- Test: `src/__tests__/lib/insights/compact-data.test.ts` (existing — should still pass)

**Step 1: Migrate all queries**

In `src/lib/insights/compact-data.ts`:

1. Remove: `import { VALID_TRANSACTION_FILTER } from '@/lib/db/filters'`

2. For every query that currently uses `FROM transactions t LEFT JOIN categories c ON t.category_id = c.id ... AND ${VALID_TRANSACTION_FILTER}`, replace with `FROM valid_transactions t` and remove the `LEFT JOIN` and filter.

3. Replace `c.name` references with `t.category_name`, `c.color` with `t.category_color`, `c.category_group` with `t.category_group`.

4. The outlier subquery (lines 243-250) uses `t2`/`c2` aliases with a manual NOT EXISTS. Replace with:

```sql
    JOIN (
      SELECT t2.category_id, AVG(t2.amount) as avg_amount
      FROM valid_transactions t2
      WHERE t2.type = 'debit' AND t2.date >= date('now', '-6 months')
      GROUP BY t2.category_id
    ) cat_avg ON t.category_id = cat_avg.category_id
```

5. The income dates query (lines 138-143) does NOT need the view — it queries for income days by specific category names. It uses raw `FROM transactions` with no alias issues. Leave it as-is since it is only checking for date existence, not computing spending totals.

6. For account summaries (lines 336-383), the three queries already use `${VALID_TRANSACTION_FILTER}`. Replace with `FROM valid_transactions t` and remove the filter + join.

Full list of queries to migrate (by approximate current line numbers):
- Monthly income/spending (~51-61): `FROM transactions t LEFT JOIN categories c` → `FROM valid_transactions t`
- Category spending (~71-81): same pattern
- Merchant profiles (~94-109): same pattern
- Day-of-week (~112-128): same pattern (inner subquery too)
- Daily spending (~146-154): same pattern
- Commitment transactions (~172-179): same pattern
- Outlier detection (~237-258): both outer + inner subquery
- Top merchants by category (~261-272): same pattern
- Recent transactions (~287-298): same pattern
- Merchant month deltas (~301-311): same pattern
- Account monthly profiles (~336-348): same pattern
- Account top categories (~360-370): same pattern
- Account top merchants (~373-383): same pattern

**Step 2: Run existing tests**

Run: `npm run test -- src/__tests__/lib/insights/compact-data.test.ts`
Expected: All 14 tests PASS

**Step 3: Commit**

```bash
git add src/lib/insights/compact-data.ts
git commit -m "refactor: migrate compact-data.ts to valid_transactions view"
```

---

### Task 7: Delete filters.ts + lint test + cleanup

**Files:**
- Delete: `src/lib/db/filters.ts`
- Create: `src/__tests__/lib/db/no-raw-transactions.test.ts`
- Modify: `CLAUDE.md` (update conventions)

**Step 1: Verify no remaining imports of VALID_TRANSACTION_FILTER**

Run: `grep -r "VALID_TRANSACTION_FILTER\|from.*filters" src/lib/ src/app/`

Expected: No matches in source files (only in docs/plans/ and CLAUDE.md).

**Step 2: Delete filters.ts**

```bash
rm src/lib/db/filters.ts
```

**Step 3: Write the lint test**

Create `src/__tests__/lib/db/no-raw-transactions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const MUST_USE_VIEW = [
  'src/lib/db/reports.ts',
  'src/lib/db/health.ts',
  'src/lib/db/commitments.ts',
  'src/lib/db/merchants.ts',
  'src/lib/insights/compact-data.ts',
]

describe('transaction query hygiene', () => {
  for (const filePath of MUST_USE_VIEW) {
    it(`${filePath} uses valid_transactions, not raw transactions`, () => {
      const content = readFileSync(join(process.cwd(), filePath), 'utf-8')
      const rawMatches = content.match(/FROM\s+transactions\b/gi) ?? []
      // Filter out subqueries that legitimately reference raw transactions (e.g., excluded_commitment_transactions)
      const realRawQueries = rawMatches.filter(m => !m.includes('excluded_commitment'))
      expect(realRawQueries).toHaveLength(0)
    })
  }

  it('VALID_TRANSACTION_FILTER is not imported anywhere', () => {
    for (const filePath of MUST_USE_VIEW) {
      const content = readFileSync(join(process.cwd(), filePath), 'utf-8')
      expect(content).not.toContain('VALID_TRANSACTION_FILTER')
    }
  })
})
```

**Step 4: Run the lint test**

Run: `npm run test -- src/__tests__/lib/db/no-raw-transactions.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 6: Update CLAUDE.md**

In the "Query Patterns" section of `CLAUDE.md`, replace the `VALID_TRANSACTION_FILTER` documentation with:

```markdown
- `valid_transactions` view: pre-filters (exclude_from_totals, transaction_class, flagged-removed) and pre-joins categories (category_name, category_color, category_group). Use for all spending/report/insight queries. Use raw `transactions` table only for CRUD, pipeline, detection, and admin queries.
```

Remove:
- The bullet about `exclude_from_totals` column usage pattern (view handles this)
- The bullet about `transaction_class` belt-and-suspenders (view handles this)

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: delete VALID_TRANSACTION_FILTER, add lint test, update CLAUDE.md"
```
