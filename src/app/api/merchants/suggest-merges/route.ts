import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllMerchants } from '@/lib/db/merchants'
import { getProviderForTask } from '@/lib/llm/factory'
import { suggestMerchantMerges } from '@/lib/llm/suggest-merges'

export async function POST() {
  const db = getDb()
  const merchants = getAllMerchants(db)
  const names = merchants.map(m => m.merchant)

  if (names.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  try {
    const { provider, providerName, model } = getProviderForTask(db, 'merge_suggestions')
    const suggestions = await suggestMerchantMerges(provider, providerName, names, model)
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Failed to get merge suggestions:', error)
    return NextResponse.json(
      { error: 'Failed to analyze merchants', suggestions: [] },
      { status: 500 }
    )
  }
}
