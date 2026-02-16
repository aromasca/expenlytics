import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllMerchants } from '@/lib/db/merchants'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const search = params.get('q') || undefined

  const db = getDb()
  const merchants = getAllMerchants(db, search)

  return NextResponse.json({ merchants })
}
