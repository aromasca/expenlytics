import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { bulkSetMerchantCategories } from '@/lib/db/merchant-categories'

export async function POST() {
  const db = getDb()

  // Get all transactions grouped by (normalized_merchant, category_id) with counts
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

  // Group by merchant → pick best category
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

    let bestCategory: { category_id: number; cnt: number; manual_count: number }

    if (totalManual > 0) {
      // Prefer category with manual overrides
      const manualCats = categories.filter(c => c.manual_count > 0)
      bestCategory = manualCats.sort((a, b) => b.manual_count - a.manual_count)[0]
      entries.push({ merchant, categoryId: bestCategory.category_id, source: 'manual', confidence: 1.0 })
    } else {
      // Majority vote
      bestCategory = categories.sort((a, b) => b.cnt - a.cnt)[0]
      const confidence = Math.round((bestCategory.cnt / totalCount) * 100) / 100
      entries.push({ merchant, categoryId: bestCategory.category_id, source: 'majority', confidence })
    }
  }

  bulkSetMerchantCategories(db, entries)

  return NextResponse.json({ merchants: entries.length })
}
