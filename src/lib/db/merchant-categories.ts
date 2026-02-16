import type Database from 'better-sqlite3'

export interface MerchantCategoryMapEntry {
  category_id: number
  source: string
  confidence: number
}

export function getMerchantCategoryMap(db: Database.Database): Map<string, MerchantCategoryMapEntry> {
  const rows = db.prepare(
    'SELECT normalized_merchant, category_id, source, confidence FROM merchant_categories'
  ).all() as Array<{ normalized_merchant: string; category_id: number; source: string; confidence: number }>

  const map = new Map<string, MerchantCategoryMapEntry>()
  for (const row of rows) {
    map.set(row.normalized_merchant, {
      category_id: row.category_id,
      source: row.source,
      confidence: row.confidence,
    })
  }
  return map
}

export function setMerchantCategory(
  db: Database.Database,
  merchant: string,
  categoryId: number,
  source: string,
  confidence: number
): void {
  db.prepare(`
    INSERT INTO merchant_categories (normalized_merchant, category_id, source, confidence, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(normalized_merchant) DO UPDATE SET
      category_id = excluded.category_id,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `).run(merchant, categoryId, source, confidence)
}

export function bulkSetMerchantCategories(
  db: Database.Database,
  entries: Array<{ merchant: string; categoryId: number; source: string; confidence: number }>
): void {
  const stmt = db.prepare(`
    INSERT INTO merchant_categories (normalized_merchant, category_id, source, confidence, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(normalized_merchant) DO UPDATE SET
      category_id = excluded.category_id,
      source = excluded.source,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `)

  const insertAll = db.transaction(() => {
    for (const entry of entries) {
      stmt.run(entry.merchant, entry.categoryId, entry.source, entry.confidence)
    }
  })
  insertAll()
}

/**
 * Populate merchant_categories from existing transaction data using majority vote.
 * Manual overrides (manual_category=1) take priority over frequency.
 * Only runs when merchant_categories is empty (first-time seeding).
 */
export function backfillMerchantCategories(db: Database.Database): number {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM merchant_categories').get() as { cnt: number }).cnt
  if (count > 0) return 0

  const rows = db.prepare(`
    SELECT t.normalized_merchant, t.category_id, COUNT(*) as cnt,
           SUM(CASE WHEN t.manual_category = 1 THEN 1 ELSE 0 END) as manual_count
    FROM transactions t
    WHERE t.normalized_merchant IS NOT NULL AND t.category_id IS NOT NULL
    GROUP BY t.normalized_merchant, t.category_id
  `).all() as Array<{
    normalized_merchant: string
    category_id: number
    cnt: number
    manual_count: number
  }>

  const merchantData = new Map<string, Array<{ category_id: number; cnt: number; manual_count: number }>>()
  for (const row of rows) {
    if (!merchantData.has(row.normalized_merchant)) {
      merchantData.set(row.normalized_merchant, [])
    }
    merchantData.get(row.normalized_merchant)!.push(row)
  }

  const entries: Array<{ merchant: string; categoryId: number; source: string; confidence: number }> = []
  for (const [merchant, categories] of merchantData) {
    const totalCount = categories.reduce((s, c) => s + c.cnt, 0)
    const totalManual = categories.reduce((s, c) => s + c.manual_count, 0)

    if (totalManual > 0) {
      const best = categories.sort((a, b) => b.manual_count - a.manual_count)[0]
      entries.push({ merchant, categoryId: best.category_id, source: 'manual', confidence: 1.0 })
    } else {
      const best = categories.sort((a, b) => b.cnt - a.cnt)[0]
      const confidence = Math.round((best.cnt / totalCount) * 100) / 100
      entries.push({ merchant, categoryId: best.category_id, source: 'majority', confidence })
    }
  }

  if (entries.length > 0) {
    bulkSetMerchantCategories(db, entries)
  }
  return entries.length
}

/**
 * Apply merchant_categories to all non-manual transactions.
 * Returns the number of transactions updated.
 */
export function applyMerchantCategories(db: Database.Database): number {
  const result = db.prepare(`
    UPDATE transactions SET category_id = (
      SELECT mc.category_id FROM merchant_categories mc
      WHERE mc.normalized_merchant = transactions.normalized_merchant
    )
    WHERE normalized_merchant IS NOT NULL
      AND manual_category = 0
      AND normalized_merchant IN (SELECT normalized_merchant FROM merchant_categories)
      AND category_id != (
        SELECT mc2.category_id FROM merchant_categories mc2
        WHERE mc2.normalized_merchant = transactions.normalized_merchant
      )
  `).run()
  return result.changes
}
