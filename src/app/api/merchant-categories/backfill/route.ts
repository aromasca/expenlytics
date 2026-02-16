import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { forceBackfillMerchantCategories } from '@/lib/db/merchant-categories'

export async function POST() {
  const db = getDb()
  const merchants = forceBackfillMerchantCategories(db)
  return NextResponse.json({ merchants })
}
