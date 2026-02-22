import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getMerchantDescriptionGroups } from '@/lib/db/merchants'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { merchants } = body ?? {}

  if (!Array.isArray(merchants) || merchants.length === 0) {
    return NextResponse.json({ error: 'merchants array required' }, { status: 400 })
  }

  const db = getDb()
  const preview: Record<string, { description: string; transactionCount: number; totalAmount: number }[]> = {}
  for (const merchant of merchants) {
    if (typeof merchant === 'string') {
      preview[merchant] = getMerchantDescriptionGroups(db, merchant)
    }
  }

  return NextResponse.json({ preview })
}
