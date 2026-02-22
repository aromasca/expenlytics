import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getMerchantDescriptionGroups, getMerchantTransactions } from '@/lib/db/merchants'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ merchant: string }> }
) {
  const { merchant } = await params
  const decoded = decodeURIComponent(merchant)
  const description = request.nextUrl.searchParams.get('description') || undefined

  const db = getDb()

  if (description) {
    const transactions = getMerchantTransactions(db, decoded, description)
    return NextResponse.json({ transactions })
  }

  const groups = getMerchantDescriptionGroups(db, decoded)
  return NextResponse.json({ groups })
}
