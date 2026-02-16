import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { applyMerchantCategories } from '@/lib/db/merchant-categories'

export async function POST() {
  const db = getDb()
  const updated = applyMerchantCategories(db)
  return NextResponse.json({ updated })
}
