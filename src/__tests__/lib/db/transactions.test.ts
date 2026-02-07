import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { createDocument } from '@/lib/db/documents'
import { insertTransactions, listTransactions, updateTransactionCategory } from '@/lib/db/transactions'
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
})
