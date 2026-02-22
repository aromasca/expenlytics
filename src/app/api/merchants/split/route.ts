import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { splitMerchant } from '@/lib/db/merchants'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { transactionIds, newMerchant } = body ?? {}

  if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
    return NextResponse.json({ error: 'transactionIds array required' }, { status: 400 })
  }
  if (!transactionIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
    return NextResponse.json({ error: 'All transactionIds must be integers' }, { status: 400 })
  }
  if (typeof newMerchant !== 'string' || !newMerchant.trim()) {
    return NextResponse.json({ error: 'newMerchant name is required' }, { status: 400 })
  }

  const db = getDb()
  const updated = splitMerchant(db, transactionIds, newMerchant.trim())
  return NextResponse.json({ updated })
}
