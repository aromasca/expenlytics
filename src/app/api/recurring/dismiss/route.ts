import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { dismissMerchant, restoreMerchant } from '@/lib/db/recurring'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const merchant = body?.merchant
  if (typeof merchant !== 'string' || !merchant.trim()) {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }

  const db = getDb()
  dismissMerchant(db, merchant.trim())
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const merchant = body?.merchant
  if (typeof merchant !== 'string' || !merchant.trim()) {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }

  const db = getDb()
  restoreMerchant(db, merchant.trim())
  return NextResponse.json({ success: true })
}
