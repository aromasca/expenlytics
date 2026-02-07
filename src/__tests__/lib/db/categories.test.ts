import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getAllCategories } from '@/lib/db/categories'

describe('categories', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('seeds default categories', () => {
    const categories = getAllCategories(db)
    expect(categories.length).toBeGreaterThanOrEqual(10)
    expect(categories.map(c => c.name)).toContain('Groceries')
    expect(categories.map(c => c.name)).toContain('Dining')
  })

  it('each category has a name and color', () => {
    const categories = getAllCategories(db)
    for (const cat of categories) {
      expect(cat.name).toBeTruthy()
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
