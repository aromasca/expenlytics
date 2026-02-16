import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { normalizeMerchants } from '@/lib/llm/normalize-merchants'
import { getProviderForTask } from '@/lib/llm/factory'

export async function POST(request: NextRequest) {
  const db = getDb()

  const body = await request.json().catch(() => ({}))
  const force = body.force === true

  // Get all distinct descriptions that need normalization
  const rows = force
    ? db.prepare("SELECT DISTINCT description FROM transactions").all() as Array<{ description: string }>
    : db.prepare("SELECT DISTINCT description FROM transactions WHERE normalized_merchant IS NULL").all() as Array<{ description: string }>

  if (rows.length === 0) {
    return NextResponse.json({ normalized: 0, message: 'All transactions already normalized' })
  }

  const descriptions = rows.map(r => r.description)

  try {
    const { provider, providerName, model } = getProviderForTask(db, 'normalization')
    const merchantMap = await normalizeMerchants(provider, providerName, descriptions, model)

    // Only update DB after LLM succeeds — never wipe data before confirming success
    const update = db.prepare(
      'UPDATE transactions SET normalized_merchant = ? WHERE description = ?'
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
