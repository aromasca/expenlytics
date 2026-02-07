import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions, listTransactions, updateTransactionCategory, findDuplicateTransaction, bulkUpdateCategories, deleteTransaction, deleteTransactions } from '@/lib/db/transactions'
import { getAllCategories } from '@/lib/db/categories'

describe('transactions', () => {
  let db: Database.Database
  let docId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    docId = createDocument(db, 'test.pdf', '/path/test.pdf')
  })

  it('inserts and lists transactions', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
      { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit' },
    ])

    const result = listTransactions(db, {})
    expect(result.transactions).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('filters by type', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
      { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit' },
    ])

    const result = listTransactions(db, { type: 'debit' })
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].description).toBe('Store')
  })

  it('filters by search term', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods Market', amount: 85, type: 'debit' },
      { date: '2025-01-16', description: 'Amazon', amount: 25, type: 'debit' },
    ])

    const result = listTransactions(db, { search: 'foods' })
    expect(result.transactions).toHaveLength(1)
  })

  it('updates transaction category', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])

    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const txns = listTransactions(db, {})
    updateTransactionCategory(db, txns.transactions[0].id, groceries.id)

    const updated = listTransactions(db, {})
    expect(updated.transactions[0].category_name).toBe('Groceries')
  })

  it('sorts by date descending by default', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-10', description: 'Early', amount: 10, type: 'debit' },
      { date: '2025-01-20', description: 'Late', amount: 20, type: 'debit' },
    ])

    const result = listTransactions(db, {})
    expect(result.transactions[0].description).toBe('Late')
  })

  it('sets manual_category flag when updating category', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])
    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const txns = listTransactions(db, {})
    updateTransactionCategory(db, txns.transactions[0].id, groceries.id, true)

    const updated = listTransactions(db, {})
    expect(updated.transactions[0].manual_category).toBe(1)
  })

  it('manual_category defaults to 0', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
    ])
    const txns = listTransactions(db, {})
    expect(txns.transactions[0].manual_category).toBe(0)
  })

  it('finds duplicate transaction by date+description+amount+type', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
    ])
    const dup = findDuplicateTransaction(db, { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' })
    expect(dup).toBeDefined()
    expect(dup!.description).toBe('Whole Foods')
  })

  it('returns undefined when no duplicate exists', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
    ])
    const dup = findDuplicateTransaction(db, { date: '2025-01-16', description: 'Whole Foods', amount: 85.50, type: 'debit' })
    expect(dup).toBeUndefined()
  })

  it('bulk updates categories respecting manual flag', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store A', amount: 50, type: 'debit' },
      { date: '2025-01-16', description: 'Store B', amount: 30, type: 'debit' },
    ])
    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const shopping = categories.find(c => c.name === 'Shopping')!

    // Manually override Store A
    const txns = listTransactions(db, {})
    const storeA = txns.transactions.find(t => t.description === 'Store A')!
    updateTransactionCategory(db, storeA.id, groceries.id, true)

    // Bulk update both — Store A should not change
    const storeB = txns.transactions.find(t => t.description === 'Store B')!
    bulkUpdateCategories(db, [
      { transactionId: storeA.id, categoryId: shopping.id },
      { transactionId: storeB.id, categoryId: shopping.id },
    ])

    const updated = listTransactions(db, {})
    const updatedA = updated.transactions.find(t => t.description === 'Store A')!
    const updatedB = updated.transactions.find(t => t.description === 'Store B')!
    expect(updatedA.category_name).toBe('Groceries') // preserved manual override
    expect(updatedB.category_name).toBe('Shopping')   // updated
  })

  it('deletes a single transaction', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit' },
      { date: '2025-01-16', description: 'Cafe', amount: 10, type: 'debit' },
    ])
    const txns = listTransactions(db, {})
    deleteTransaction(db, txns.transactions[0].id)
    const result = listTransactions(db, {})
    expect(result.total).toBe(1)
    expect(result.transactions[0].description).toBe('Store')
  })

  it('bulk deletes multiple transactions', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
      { date: '2025-01-16', description: 'B', amount: 20, type: 'debit' },
      { date: '2025-01-17', description: 'C', amount: 30, type: 'debit' },
    ])
    const txns = listTransactions(db, {})
    const idsToDelete = txns.transactions.filter(t => t.description !== 'B').map(t => t.id)
    const deleted = deleteTransactions(db, idsToDelete)
    expect(deleted).toBe(2)
    const result = listTransactions(db, {})
    expect(result.total).toBe(1)
    expect(result.transactions[0].description).toBe('B')
  })

  it('returns 0 when deleting empty array', () => {
    const deleted = deleteTransactions(db, [])
    expect(deleted).toBe(0)
  })

  it('filters by date range', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-10', description: 'Early', amount: 10, type: 'debit' },
      { date: '2025-02-15', description: 'Mid', amount: 20, type: 'debit' },
      { date: '2025-03-20', description: 'Late', amount: 30, type: 'debit' },
    ])
    const result = listTransactions(db, { start_date: '2025-02-01', end_date: '2025-02-28' })
    expect(result.total).toBe(1)
    expect(result.transactions[0].description).toBe('Mid')
  })

  it('filters by document_id', () => {
    const docId2 = createDocument(db, 'other.pdf', '/path/other.pdf')
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'Doc1', amount: 10, type: 'debit' },
    ])
    insertTransactions(db, docId2, [
      { date: '2025-01-16', description: 'Doc2', amount: 20, type: 'debit' },
    ])
    const result = listTransactions(db, { document_id: docId2 })
    expect(result.total).toBe(1)
    expect(result.transactions[0].description).toBe('Doc2')
  })

  it('has normalized_merchant column on transactions', () => {
    const columns = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>
    const names = columns.map(c => c.name)
    expect(names).toContain('normalized_merchant')
  })

  it('filters by multiple category_ids', () => {
    insertTransactions(db, docId, [
      { date: '2025-01-15', description: 'A', amount: 10, type: 'debit' },
      { date: '2025-01-16', description: 'B', amount: 20, type: 'debit' },
      { date: '2025-01-17', description: 'C', amount: 30, type: 'debit' },
    ])
    const categories = getAllCategories(db)
    const groceries = categories.find(c => c.name === 'Groceries')!
    const shopping = categories.find(c => c.name === 'Shopping')!
    const txns = listTransactions(db, {})
    updateTransactionCategory(db, txns.transactions[0].id, groceries.id)
    updateTransactionCategory(db, txns.transactions[1].id, shopping.id)

    const result = listTransactions(db, { category_ids: [groceries.id, shopping.id] })
    expect(result.total).toBe(2)
  })
})
