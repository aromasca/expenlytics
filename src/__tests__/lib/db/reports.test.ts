import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions, updateTransactionCategory } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'
import {
  getSpendingSummary,
  getSpendingOverTime,
  getCategoryBreakdown,
  getSpendingTrend,
  getTopTransactions,
  getSankeyData,
} from '@/lib/db/reports'
import type { ReportFilters } from '@/lib/db/reports'

describe('reports', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')

    // Seed data across multiple months
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Groceries', amount: 100, type: 'debit' },
      { date: '2025-01-20', description: 'Salary', amount: 3000, type: 'credit' },
      { date: '2025-02-10', description: 'Restaurant', amount: 50, type: 'debit' },
      { date: '2025-02-15', description: 'Utilities', amount: 200, type: 'debit' },
      { date: '2025-03-05', description: 'Shopping', amount: 75, type: 'debit' },
    ])

    // Assign categories
    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const dining = categories.find(c => c.name === 'Restaurants')!
    const utilities = categories.find(c => c.name === 'Utilities')!
    const shopping = categories.find(c => c.name === 'General Merchandise')!
    const income = categories.find(c => c.name === 'Salary & Wages')!

    const all = db.prepare('SELECT id, description FROM transactions ORDER BY date ASC').all() as Array<{ id: number; description: string }>
    updateTransactionCategory(db, all.find(t => t.description === 'Groceries')!.id, groceries.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Salary')!.id, income.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Restaurant')!.id, dining.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Utilities')!.id, utilities.id)
    updateTransactionCategory(db, all.find(t => t.description === 'Shopping')!.id, shopping.id)
  })

  describe('getSpendingSummary', () => {
    it('computes totals for all data', () => {
      const summary = getSpendingSummary(db, {})
      expect(summary.totalSpent).toBe(425)
      expect(summary.totalIncome).toBe(3000)
      expect(summary.topCategory.name).toBe('Utilities')
      expect(summary.topCategory.amount).toBe(200)
    })

    it('filters by date range', () => {
      const summary = getSpendingSummary(db, { start_date: '2025-02-01', end_date: '2025-02-28' })
      expect(summary.totalSpent).toBe(250)
      expect(summary.totalIncome).toBe(0)
    })

    it('computes average monthly spend', () => {
      const summary = getSpendingSummary(db, {})
      // 3 months of data (Jan, Feb, Mar), total debits = 425
      expect(summary.avgMonthly).toBeCloseTo(141.67, 1)
    })

    it('excludes transfer/savings/investments debits from totalSpent', () => {
      const categories = getAllCategories(db)
      const transfer = categories.find(c => c.name === 'Transfer')!
      const savings = categories.find(c => c.name === 'Savings')!
      const investments = categories.find(c => c.name === 'Investments')!

      // Add transfer-category debits
      insertTransactions(db, docId, [
        { date: '2025-01-16', description: 'CC Payment', amount: 500, type: 'debit' },
        { date: '2025-01-17', description: 'Savings Transfer', amount: 1000, type: 'debit' },
        { date: '2025-01-18', description: '401k Contribution', amount: 800, type: 'debit' },
      ])
      const txns = db.prepare("SELECT id, description FROM transactions WHERE description IN ('CC Payment', 'Savings Transfer', '401k Contribution')").all() as Array<{ id: number; description: string }>
      updateTransactionCategory(db, txns.find(t => t.description === 'CC Payment')!.id, transfer.id)
      updateTransactionCategory(db, txns.find(t => t.description === 'Savings Transfer')!.id, savings.id)
      updateTransactionCategory(db, txns.find(t => t.description === '401k Contribution')!.id, investments.id)

      const summary = getSpendingSummary(db, {})
      // Original debits = 425, transfer debits (500+1000+800=2300) excluded
      expect(summary.totalSpent).toBe(425)
    })

    it('excludes refund/transfer credits from totalIncome', () => {
      const categories = getAllCategories(db)
      const transfer = categories.find(c => c.name === 'Transfer')!
      const refund = categories.find(c => c.name === 'Refund')!

      insertTransactions(db, docId, [
        { date: '2025-01-21', description: 'Transfer In', amount: 2000, type: 'credit' },
        { date: '2025-01-22', description: 'Refund', amount: 50, type: 'credit' },
      ])
      const txns = db.prepare("SELECT id, description FROM transactions WHERE description IN ('Transfer In', 'Refund')").all() as Array<{ id: number; description: string }>
      updateTransactionCategory(db, txns.find(t => t.description === 'Transfer In')!.id, transfer.id)
      updateTransactionCategory(db, txns.find(t => t.description === 'Refund')!.id, refund.id)

      const summary = getSpendingSummary(db, {})
      // Only Salary (3000) counts as income; Transfer (2000) and Refund (50) excluded
      expect(summary.totalIncome).toBe(3000)
    })
  })

  describe('getSpendingOverTime', () => {
    it('groups by month', () => {
      const data = getSpendingOverTime(db, {}, 'month')
      expect(data).toHaveLength(3)
      expect(data[0]).toEqual({ period: '2025-01', amount: 100 })
      expect(data[1]).toEqual({ period: '2025-02', amount: 250 })
      expect(data[2]).toEqual({ period: '2025-03', amount: 75 })
    })

    it('filters by type debit only (default for spending)', () => {
      const data = getSpendingOverTime(db, { type: 'debit' }, 'month')
      expect(data).toHaveLength(3)
      expect(data[0].amount).toBe(100)
    })
  })

  describe('getCategoryBreakdown', () => {
    it('returns category totals for debits', () => {
      const data = getCategoryBreakdown(db, {})
      expect(data.length).toBeGreaterThanOrEqual(4)
      const utilities = data.find(d => d.category === 'Utilities')
      expect(utilities).toBeDefined()
      expect(utilities!.amount).toBe(200)
      const totalPct = data.reduce((sum, d) => sum + d.percentage, 0)
      expect(totalPct).toBeCloseTo(100, 0)
    })
  })

  describe('getSpendingTrend', () => {
    it('returns monthly debits and credits', () => {
      const data = getSpendingTrend(db, {})
      expect(data).toHaveLength(3)
      expect(data[0]).toEqual({ period: '2025-01', debits: 100, credits: 3000 })
      expect(data[1]).toEqual({ period: '2025-02', debits: 250, credits: 0 })
      expect(data[2]).toEqual({ period: '2025-03', debits: 75, credits: 0 })
    })

    it('excludes transfer-category transactions from debits and credits', () => {
      const categories = getAllCategories(db)
      const transfer = categories.find(c => c.name === 'Transfer')!

      insertTransactions(db, docId, [
        { date: '2025-01-25', description: 'CC Payment', amount: 500, type: 'debit' },
        { date: '2025-01-26', description: 'Transfer In', amount: 1000, type: 'credit' },
      ])
      const txns = db.prepare("SELECT id, description FROM transactions WHERE description IN ('CC Payment', 'Transfer In')").all() as Array<{ id: number; description: string }>
      updateTransactionCategory(db, txns.find(t => t.description === 'CC Payment')!.id, transfer.id)
      updateTransactionCategory(db, txns.find(t => t.description === 'Transfer In')!.id, transfer.id)

      const data = getSpendingTrend(db, {})
      const jan = data.find(d => d.period === '2025-01')!
      // Original: debits 100, credits 3000. Transfer debit (500) and credit (1000) excluded.
      expect(jan.debits).toBe(100)
      expect(jan.credits).toBe(3000)
    })
  })

  describe('getTopTransactions', () => {
    it('returns top N transactions by amount descending', () => {
      const data = getTopTransactions(db, {}, 3)
      expect(data).toHaveLength(3)
      expect(data[0].amount).toBe(3000)
      expect(data[1].amount).toBe(200)
      expect(data[2].amount).toBe(100)
    })

    it('filters by date range', () => {
      const data = getTopTransactions(db, { start_date: '2025-02-01', end_date: '2025-03-31' }, 10)
      expect(data).toHaveLength(3)
      expect(data[0].amount).toBe(200)
    })
  })

  describe('getSankeyData', () => {
    it('returns spending grouped by category_group and category', () => {
      const result = getSankeyData(db, {})
      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toHaveProperty('category')
      expect(result[0]).toHaveProperty('category_group')
      expect(result[0]).toHaveProperty('amount')
    })

    it('excludes transfer-category debits', () => {
      const categories = getAllCategories(db)
      const transfer = categories.find(c => c.name === 'Transfer')!

      insertTransactions(db, docId, [
        { date: '2025-01-25', description: 'CC Payment', amount: 500, type: 'debit' },
      ])
      const txn = db.prepare("SELECT id FROM transactions WHERE description = 'CC Payment'").get() as { id: number }
      updateTransactionCategory(db, txn.id, transfer.id)

      const result = getSankeyData(db, {})
      const transferRow = result.find(r => r.category === 'Transfer')
      expect(transferRow).toBeUndefined()
    })

    it('only includes debit transactions', () => {
      const result = getSankeyData(db, {})
      const totalFromSankey = result.reduce((sum, r) => sum + r.amount, 0)
      const summary = getSpendingSummary(db, {})
      expect(totalFromSankey).toBeCloseTo(summary.totalSpent, 2)
    })

    it('respects date filters', () => {
      const all = getSankeyData(db, {})
      const filtered = getSankeyData(db, { start_date: '2025-01-01', end_date: '2025-01-31' })
      expect(filtered.length).toBeLessThanOrEqual(all.length)
    })
  })
})
