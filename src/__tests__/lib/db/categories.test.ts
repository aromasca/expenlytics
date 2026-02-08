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
    expect(categories).toHaveLength(69)
    expect(categories.map(c => c.name)).toContain('Groceries')
    expect(categories.map(c => c.name)).toContain('Restaurants')
    expect(categories.map(c => c.name)).toContain('Coffee & Cafes')
    expect(categories.map(c => c.name)).toContain('Streaming Services')
  })

  it('each category has a name, color, and group', () => {
    const categories = getAllCategories(db)
    for (const cat of categories) {
      expect(cat.name).toBeTruthy()
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(cat.category_group).toBeTruthy()
    }
  })

  it('has expected category groups', () => {
    const categories = getAllCategories(db)
    const groups = new Set(categories.map(c => c.category_group))
    expect(groups).toContain('Food & Drink')
    expect(groups).toContain('Transportation')
    expect(groups).toContain('Housing')
    expect(groups).toContain('Shopping')
    expect(groups).toContain('Health & Wellness')
    expect(groups).toContain('Entertainment')
    expect(groups).toContain('Travel')
    expect(groups).toContain('Financial')
    expect(groups).toContain('Income & Transfers')
  })
})
