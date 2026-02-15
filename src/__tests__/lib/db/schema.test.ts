import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'

describe('schema migrations', () => {
  it('adds exclude_from_totals column to categories', () => {
    const db = new Database(':memory:')
    initializeSchema(db)

    const columns = db.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>
    const columnNames = columns.map(c => c.name)
    expect(columnNames).toContain('exclude_from_totals')
  })

  it('sets exclude_from_totals flag on Transfer, Refund, Savings, Investments', () => {
    const db = new Database(':memory:')
    initializeSchema(db)

    const excluded = db.prepare('SELECT name FROM categories WHERE exclude_from_totals = 1 ORDER BY name').all() as Array<{ name: string }>
    const names = excluded.map(c => c.name)
    expect(names).toEqual(['Investments', 'Refund', 'Savings', 'Transfer'])
  })

  it('does not flag other categories', () => {
    const db = new Database(':memory:')
    initializeSchema(db)

    const nonExcluded = db.prepare('SELECT name FROM categories WHERE exclude_from_totals = 0 OR exclude_from_totals IS NULL').all() as Array<{ name: string }>
    const names = nonExcluded.map(c => c.name)
    expect(names).toContain('Groceries')
    expect(names).toContain('Salary & Wages')
    expect(names).not.toContain('Transfer')
    expect(names).not.toContain('Refund')
  })

  it('migration is idempotent', () => {
    const db = new Database(':memory:')
    initializeSchema(db)
    // Run again — should not error
    initializeSchema(db)

    const excluded = db.prepare('SELECT name FROM categories WHERE exclude_from_totals = 1 ORDER BY name').all() as Array<{ name: string }>
    expect(excluded).toHaveLength(4)
  })
})
