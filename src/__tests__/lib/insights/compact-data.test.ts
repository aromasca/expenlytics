import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { buildCompactData } from '@/lib/insights/compact-data'

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }
  return row.id
}

function insertTx(db: Database.Database, opts: {
  date: string; description: string; amount: number;
  type?: string; category?: string; normalized_merchant?: string;
  docId?: number
}) {
  let docId = opts.docId
  if (!docId) {
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-' || abs(random()))
    `).run()
    docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
  }
  const categoryId = opts.category ? getCategoryId(db, opts.category) : null
  db.prepare(`
    INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(docId, opts.date, opts.description, opts.amount, opts.type ?? 'debit', categoryId, opts.normalized_merchant ?? null)
  return { docId, txId: (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id }
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

describe('buildCompactData', () => {
  it('returns empty structure for no transactions', () => {
    const db = createDb()
    const data = buildCompactData(db)
    expect(data.monthly).toEqual([])
    expect(data.categories).toEqual([])
    expect(data.merchants).toEqual([])
    expect(data.day_of_week).toHaveLength(7)
    expect(data.daily_recent).toEqual([])
    expect(data.active_commitments).toEqual([])
    expect(data.commitment_baseline).toEqual({ total_monthly: 0, count: 0 })
    expect(data.account_summaries).toEqual([])
    expect(data.outliers).toEqual([])
  })

  it('compacts monthly income and spending', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.monthly.length).toBeGreaterThanOrEqual(1)
    const m = data.monthly.find(r => r.income > 0)
    expect(m).toBeDefined()
    expect(m!.income).toBe(5000)
    expect(m!.spending).toBe(200)
    expect(m!.net).toBe(4800)
  })

  it('includes merchant profiles with frequency data', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(3), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    const data = buildCompactData(db)
    const netflix = data.merchants.find(m => m.name === 'Netflix')
    expect(netflix).toBeDefined()
    expect(netflix!.count).toBe(3)
    expect(netflix!.total).toBe(45)
  })

  it('includes day-of-week distribution', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Test', amount: 100, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.day_of_week).toHaveLength(7)
    const totalTxns = data.day_of_week.reduce((s, d) => s + d.transaction_count, 0)
    expect(totalTxns).toBe(1)
  })

  it('excludes payment/transfer transaction_class from compact data', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    // Insert a payment-class transaction with normal category
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-class-test')
    `).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    const catId = getCategoryId(db, 'Groceries')
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'Payment', 500, 'debit', ?, 'payment')
    `).run(docId, monthsAgo(1), catId)
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'Transfer Out', 1000, 'debit', ?, 'transfer')
    `).run(docId, monthsAgo(1), catId)

    const data = buildCompactData(db)
    const m = data.monthly.find(r => r.spending > 0)
    expect(m).toBeDefined()
    // Only Groceries (200) counts; payment (500) and transfer (1000) excluded
    expect(m!.spending).toBe(200)
  })

  it('includes recent_transactions for last 90 days', () => {
    const db = createDb()
    // Transaction within 90 days — should be included
    insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 85.50, category: 'Groceries', normalized_merchant: 'Whole Foods' })
    // Transaction outside 90 days — should be excluded
    insertTx(db, { date: monthsAgo(4), description: 'Old Purchase', amount: 50, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.recent_transactions).toBeDefined()
    expect(data.recent_transactions).toHaveLength(1)
    expect(data.recent_transactions[0]).toMatchObject({
      date: expect.any(String),
      description: 'Whole Foods',
      amount: 85.50,
      type: 'debit',
      category: 'Groceries',
      normalized_merchant: 'Whole Foods',
    })
  })

  it('excludes transfer/payment classes from recent_transactions', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    // Insert a payment-class transaction
    db.prepare(`
      INSERT INTO documents (filename, filepath, status, file_hash)
      VALUES ('test.pdf', '/tmp/test.pdf', 'completed', 'hash-recent-txn-test')
    `).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    const catId = getCategoryId(db, 'Groceries')
    db.prepare(`
      INSERT INTO transactions (document_id, date, description, amount, type, category_id, transaction_class)
      VALUES (?, ?, 'CC Payment', 500, 'debit', ?, 'payment')
    `).run(docId, monthsAgo(1), catId)
    const data = buildCompactData(db)
    expect(data.recent_transactions).toHaveLength(1)
    expect(data.recent_transactions[0].description).toBe('Groceries')
  })

  it('includes merchant_month_deltas for top merchants', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(2), description: 'Netflix', amount: 15, normalized_merchant: 'Netflix', category: 'Streaming Services' })
    insertTx(db, { date: monthsAgo(1), description: 'Whole Foods', amount: 200, normalized_merchant: 'Whole Foods', category: 'Groceries' })
    insertTx(db, { date: monthsAgo(2), description: 'Whole Foods', amount: 150, normalized_merchant: 'Whole Foods', category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.merchant_month_deltas).toBeDefined()
    expect(data.merchant_month_deltas.length).toBeGreaterThanOrEqual(2)
    const wf = data.merchant_month_deltas.find(m => m.merchant === 'Whole Foods')
    expect(wf).toBeDefined()
    expect(Object.keys(wf!.months).length).toBeGreaterThanOrEqual(2)
  })

  it('excludes transfer/savings/investments from all compact data sections', () => {
    const db = createDb()
    // Real spending
    insertTx(db, { date: monthsAgo(1), description: 'Groceries', amount: 200, category: 'Groceries' })
    insertTx(db, { date: monthsAgo(1), description: 'Salary', amount: 5000, type: 'credit', category: 'Salary & Wages' })
    // Inter-account transfers (should be excluded)
    insertTx(db, { date: monthsAgo(1), description: 'CC Payment', amount: 500, category: 'Transfer' })
    insertTx(db, { date: monthsAgo(1), description: 'Savings Transfer', amount: 1000, category: 'Savings' })
    insertTx(db, { date: monthsAgo(1), description: '401k Contribution', amount: 800, category: 'Investments' })
    insertTx(db, { date: monthsAgo(1), description: 'Refund', amount: 50, type: 'credit', category: 'Refund' })

    const data = buildCompactData(db)

    // Monthly: only real income (5000) and spending (200)
    const m = data.monthly.find(r => r.income > 0)
    expect(m).toBeDefined()
    expect(m!.income).toBe(5000)
    expect(m!.spending).toBe(200)

    // Categories: should not include Transfer/Savings/Investments
    const catNames = data.categories.map(c => c.category)
    expect(catNames).not.toContain('Transfer')
    expect(catNames).not.toContain('Savings')
    expect(catNames).not.toContain('Investments')

    // Day-of-week: only 1 real debit transaction
    const totalTxns = data.day_of_week.reduce((s, d) => s + d.transaction_count, 0)
    expect(totalTxns).toBe(1)
  })

  it('detects active_commitments from recurring transactions', () => {
    const db = createDb()
    // 3 monthly charges for Acme SaaS
    insertTx(db, { date: monthsAgo(1), description: 'Acme SaaS', amount: 29.99, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(2), description: 'Acme SaaS', amount: 29.99, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(3), description: 'Acme SaaS', amount: 29.99, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })

    const data = buildCompactData(db)
    expect(data.active_commitments.length).toBe(1)
    const commitment = data.active_commitments[0]
    expect(commitment.merchant).toBe('Acme SaaS')
    expect(commitment.frequency).toBe('monthly')
    expect(commitment.estimated_monthly).toBeGreaterThan(0)
    expect(commitment.recent_amounts).toEqual([29.99, 29.99, 29.99])
    expect(commitment.category).toBe('SaaS & Subscriptions')
    expect(commitment.first_seen).toBeDefined()
    expect(commitment.last_seen).toBeDefined()
  })

  it('excludes ended commitments from active_commitments', () => {
    const db = createDb()
    // 3 monthly charges
    insertTx(db, { date: monthsAgo(1), description: 'Acme Cloud', amount: 50, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(2), description: 'Acme Cloud', amount: 50, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(3), description: 'Acme Cloud', amount: 50, normalized_merchant: 'Acme Cloud', category: 'SaaS & Subscriptions' })

    // Mark as ended
    db.prepare(`INSERT INTO commitment_status (normalized_merchant, status, status_changed_at) VALUES (?, 'ended', datetime('now'))`).run('Acme Cloud')

    const data = buildCompactData(db)
    expect(data.active_commitments.length).toBe(0)
    expect(data.commitment_baseline.total_monthly).toBe(0)
    expect(data.commitment_baseline.count).toBe(0)
  })

  it('computes commitment_baseline totals across multiple commitments', () => {
    const db = createDb()
    // Commitment 1: Acme SaaS
    insertTx(db, { date: monthsAgo(1), description: 'Acme SaaS', amount: 30, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(2), description: 'Acme SaaS', amount: 30, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
    insertTx(db, { date: monthsAgo(3), description: 'Acme SaaS', amount: 30, normalized_merchant: 'Acme SaaS', category: 'SaaS & Subscriptions' })
    // Commitment 2: Acme Fitness
    insertTx(db, { date: monthsAgo(1), description: 'Acme Fitness', amount: 50, normalized_merchant: 'Acme Fitness', category: 'Fitness & Gym' })
    insertTx(db, { date: monthsAgo(2), description: 'Acme Fitness', amount: 50, normalized_merchant: 'Acme Fitness', category: 'Fitness & Gym' })
    insertTx(db, { date: monthsAgo(3), description: 'Acme Fitness', amount: 50, normalized_merchant: 'Acme Fitness', category: 'Fitness & Gym' })

    const data = buildCompactData(db)
    expect(data.commitment_baseline.count).toBe(2)
    expect(data.commitment_baseline.total_monthly).toBeGreaterThan(0)
    // Both are ~30/month and ~50/month
    expect(data.commitment_baseline.total_monthly).toBeCloseTo(80, -1)
  })

  it('builds account_summaries when accounts exist', () => {
    const db = createDb()

    // Create account
    db.prepare(`INSERT INTO accounts (name, institution, last_four, type) VALUES ('Checking', 'Acme Bank', '1234', 'checking')`).run()
    const acctId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    // Create document and link to account
    db.prepare(`INSERT INTO documents (filename, filepath, status, file_hash) VALUES ('stmt.pdf', '/tmp/stmt.pdf', 'completed', 'hash-acct-test')`).run()
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    db.prepare(`INSERT INTO document_accounts (document_id, account_id) VALUES (?, ?)`).run(docId, acctId)

    // Insert transactions against that document
    const catId = getCategoryId(db, 'Groceries')
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, 'Acme Grocery', 150, 'debit', ?, 'Acme Grocery')`).run(docId, monthsAgo(1), catId)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant) VALUES (?, ?, 'Acme Grocery', 100, 'debit', ?, 'Acme Grocery')`).run(docId, monthsAgo(2), catId)
    db.prepare(`INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, 'Salary', 5000, 'credit', ?)`).run(docId, monthsAgo(1), getCategoryId(db, 'Salary & Wages'))

    const data = buildCompactData(db)
    expect(data.account_summaries).toHaveLength(1)
    const acct = data.account_summaries[0]
    expect(acct.name).toBe('Acme Bank (...1234)')
    expect(acct.type).toBe('checking')
    expect(Object.keys(acct.months).length).toBeGreaterThanOrEqual(1)
    expect(acct.top_categories.length).toBeGreaterThanOrEqual(1)
    expect(acct.top_merchants.length).toBeGreaterThanOrEqual(1)
    expect(acct.top_merchants[0].name).toBe('Acme Grocery')
  })

  it('returns empty account_summaries when no accounts exist', () => {
    const db = createDb()
    insertTx(db, { date: monthsAgo(1), description: 'Test', amount: 100, category: 'Groceries' })
    const data = buildCompactData(db)
    expect(data.account_summaries).toEqual([])
  })
})
