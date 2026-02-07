import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

export async function POST() {
  const db = getDb()

  // Find transactions without normalized_merchant
  const rows = db.prepare(
    "SELECT DISTINCT description FROM transactions WHERE normalized_merchant IS NULL"
  ).all() as Array<{ description: string }>

  if (rows.length === 0) {
    return NextResponse.json({ normalized: 0, message: 'All transactions already normalized' })
  }

  const descriptions = rows.map(r => r.description)

  try {
    const merchantMap = await normalizeMerchants(descriptions)

    const update = db.prepare(
      'UPDATE transactions SET normalized_merchant = ? WHERE description = ? AND normalized_merchant IS NULL'
    )
    const updateMany = db.transaction(() => {
      for (const [description, merchant] of merchantMap) {
        update.run(merchant, description)
      }
    })
    updateMany()

    return NextResponse.json({ normalized: merchantMap.size })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Normalization failed: ${message}` }, { status: 500 })
  }
}
