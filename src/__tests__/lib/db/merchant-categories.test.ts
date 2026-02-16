import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import {
  getMerchantCategoryMap,
  setMerchantCategory,
  bulkSetMerchantCategories,
} from '@/lib/db/merchant-categories'

describe('merchant-categories', () => {
  let db: Database.Database
  let groceriesId: number
  let fastFoodId: number

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
    groceriesId = (db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id
    fastFoodId = (db.prepare("SELECT id FROM categories WHERE name = 'Fast Food'").get() as { id: number }).id
  })

  describe('setMerchantCategory', () => {
    it('inserts a new merchant category mapping', () => {
      setMerchantCategory(db, 'Whole Foods Market', groceriesId, 'manual', 1.0)

      const map = getMerchantCategoryMap(db)
      expect(map.size).toBe(1)
      expect(map.get('Whole Foods Market')).toEqual({ category_id: groceriesId, source: 'manual', confidence: 1.0 })
    })

    it('upserts on conflict', () => {
      setMerchantCategory(db, 'Shake Shack', groceriesId, 'auto', 0.6)
      setMerchantCategory(db, 'Shake Shack', fastFoodId, 'manual', 1.0)

      const map = getMerchantCategoryMap(db)
      expect(map.size).toBe(1)
      expect(map.get('Shake Shack')).toEqual({ category_id: fastFoodId, source: 'manual', confidence: 1.0 })
    })
  })

  describe('getMerchantCategoryMap', () => {
    it('returns empty map when no entries', () => {
      const map = getMerchantCategoryMap(db)
      expect(map.size).toBe(0)
    })

    it('returns all entries as a map', () => {
      setMerchantCategory(db, 'Whole Foods Market', groceriesId, 'auto', 0.8)
      setMerchantCategory(db, 'Shake Shack', fastFoodId, 'manual', 1.0)

      const map = getMerchantCategoryMap(db)
      expect(map.size).toBe(2)
      expect(map.get('Whole Foods Market')).toEqual({ category_id: groceriesId, source: 'auto', confidence: 0.8 })
      expect(map.get('Shake Shack')).toEqual({ category_id: fastFoodId, source: 'manual', confidence: 1.0 })
    })
  })

  describe('bulkSetMerchantCategories', () => {
    it('inserts multiple entries in a transaction', () => {
      bulkSetMerchantCategories(db, [
        { merchant: 'Whole Foods Market', categoryId: groceriesId, source: 'majority', confidence: 0.9 },
        { merchant: 'Shake Shack', categoryId: fastFoodId, source: 'majority', confidence: 0.85 },
      ])

      const map = getMerchantCategoryMap(db)
      expect(map.size).toBe(2)
    })

    it('upserts existing entries', () => {
      setMerchantCategory(db, 'Shake Shack', groceriesId, 'auto', 0.6)
      bulkSetMerchantCategories(db, [
        { merchant: 'Shake Shack', categoryId: fastFoodId, source: 'majority', confidence: 0.9 },
      ])

      const map = getMerchantCategoryMap(db)
      expect(map.get('Shake Shack')!.category_id).toBe(fastFoodId)
      expect(map.get('Shake Shack')!.confidence).toBe(0.9)
    })
  })
})
