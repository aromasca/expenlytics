import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, dismissInsight, getDismissedInsightIds, clearDismissedInsights } from '@/lib/db/insight-cache'
function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

const mockInsight = {
  id: 'test-1',
  headline: 'Test insight',
  severity: 'notable',
  key_metric: '$100/mo',
  explanation: 'Test explanation',
}

describe('insight-cache', () => {
  it('generates a cache key from transaction data', () => {
    const db = createDb()
    const key = generateCacheKey(db)
    expect(typeof key).toBe('string')
    expect(key.length).toBe(16)
  })

  it('returns null for cache miss', () => {
    const db = createDb()
    expect(getCachedInsights(db, 'nonexistent')).toBeNull()
  })

  it('stores and retrieves cached insights', () => {
    const db = createDb()
    setCachedInsights(db, 'test-key', [mockInsight])
    const result = getCachedInsights(db, 'test-key')
    expect(result).toEqual([mockInsight])
  })

  it('returns null for expired cache entries', () => {
    const db = createDb()
    // Insert with already-expired TTL
    db.prepare(`
      INSERT INTO insight_cache (cache_key, insight_data, created_at, expires_at)
      VALUES (?, ?, datetime('now'), datetime('now', '-1 hour'))
    `).run('expired-key', JSON.stringify([mockInsight]))

    expect(getCachedInsights(db, 'expired-key')).toBeNull()
  })

  it('cleans up expired entries on write', () => {
    const db = createDb()
    // Insert expired entry
    db.prepare(`
      INSERT INTO insight_cache (cache_key, insight_data, created_at, expires_at)
      VALUES (?, ?, datetime('now'), datetime('now', '-1 hour'))
    `).run('old-key', '[]')

    setCachedInsights(db, 'new-key', [mockInsight])

    const count = (db.prepare('SELECT COUNT(*) as c FROM insight_cache').get() as { c: number }).c
    expect(count).toBe(1) // only new-key remains
  })

  it('clearInsightCache removes all entries', () => {
    const db = createDb()
    setCachedInsights(db, 'k1', [mockInsight])
    setCachedInsights(db, 'k2', [mockInsight])
    clearInsightCache(db)
    const count = (db.prepare('SELECT COUNT(*) as c FROM insight_cache').get() as { c: number }).c
    expect(count).toBe(0)
  })

  it('dismissInsight stores an insight id', () => {
    const db = createDb()
    dismissInsight(db, 'insight-abc')
    const ids = getDismissedInsightIds(db)
    expect(ids).toEqual(['insight-abc'])
  })

  it('dismissInsight ignores duplicates', () => {
    const db = createDb()
    dismissInsight(db, 'insight-abc')
    dismissInsight(db, 'insight-abc')
    const ids = getDismissedInsightIds(db)
    expect(ids).toEqual(['insight-abc'])
  })

  it('getDismissedInsightIds returns all dismissed ids', () => {
    const db = createDb()
    dismissInsight(db, 'a')
    dismissInsight(db, 'b')
    dismissInsight(db, 'c')
    const ids = getDismissedInsightIds(db)
    expect(ids).toHaveLength(3)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('clearDismissedInsights removes all dismissals', () => {
    const db = createDb()
    dismissInsight(db, 'x')
    dismissInsight(db, 'y')
    clearDismissedInsights(db)
    expect(getDismissedInsightIds(db)).toEqual([])
  })
})
