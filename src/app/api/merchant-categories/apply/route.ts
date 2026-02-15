import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllMerchantCategories } from '@/lib/db/merchant-categories'

export async function POST() {
  const db = getDb()
  const merchantCategories = getAllMerchantCategories(db)

  const update = db.prepare(
    'UPDATE transactions SET category_id = ? WHERE normalized_merchant = ? AND manual_category = 0'
  )

  let totalUpdated = 0
  const applyAll = db.transaction(() => {
    for (const mc of merchantCategories) {
      const result = update.run(mc.category_id, mc.normalized_merchant)
      totalUpdated += result.changes
    }
  })
  applyAll()

  return NextResponse.json({ updated: totalUpdated, merchants: merchantCategories.length })
}
