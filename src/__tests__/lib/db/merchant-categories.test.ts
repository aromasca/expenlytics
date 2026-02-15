import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import {
  getMerchantCategoryMap,
  setMerchantCategory,
  bulkSetMerchantCategories,
  deleteMerchantCategory,
  getAllMerchantCategories,
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

      const all = getAllMerchantCategories(db)
      expect(all).toHaveLength(1)
      expect(all[0].normalized_merchant).toBe('Whole Foods Market')
      expect(all[0].category_id).toBe(groceriesId)
      expect(all[0].source).toBe('manual')
      expect(all[0].confidence).toBe(1.0)
    })

    it('upserts on conflict', () => {
      setMerchantCategory(db, 'Shake Shack', groceriesId, 'auto', 0.6)
      setMerchantCategory(db, 'Shake Shack', fastFoodId, 'manual', 1.0)

      const all = getAllMerchantCategories(db)
      expect(all).toHaveLength(1)
      expect(all[0].category_id).toBe(fastFoodId)
      expect(all[0].source).toBe('manual')
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

      const all = getAllMerchantCategories(db)
      expect(all).toHaveLength(2)
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

  describe('deleteMerchantCategory', () => {
    it('deletes a merchant category mapping', () => {
      setMerchantCategory(db, 'Whole Foods Market', groceriesId, 'auto', 0.8)
      expect(getAllMerchantCategories(db)).toHaveLength(1)

      deleteMerchantCategory(db, 'Whole Foods Market')
      expect(getAllMerchantCategories(db)).toHaveLength(0)
    })

    it('does nothing for non-existent merchant', () => {
      deleteMerchantCategory(db, 'Non Existent')
      expect(getAllMerchantCategories(db)).toHaveLength(0)
    })
  })

  describe('getAllMerchantCategories', () => {
    it('returns entries sorted by merchant name', () => {
      setMerchantCategory(db, 'Whole Foods Market', groceriesId, 'auto', 0.8)
      setMerchantCategory(db, 'Amazon', groceriesId, 'manual', 1.0)
      setMerchantCategory(db, 'Shake Shack', fastFoodId, 'auto', 0.7)

      const all = getAllMerchantCategories(db)
      expect(all.map(e => e.normalized_merchant)).toEqual(['Amazon', 'Shake Shack', 'Whole Foods Market'])
    })
  })
})
