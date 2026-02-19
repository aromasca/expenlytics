import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { mergeMerchants } from '@/lib/db/commitments'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { merchants, target } = body ?? {}

  if (!Array.isArray(merchants) || merchants.length < 2) {
    return NextResponse.json({ error: 'At least 2 merchants required' }, { status: 400 })
  }
  if (typeof target !== 'string' || !target.trim()) {
    return NextResponse.json({ error: 'target name is required' }, { status: 400 })
  }
  if (!merchants.every((m: unknown) => typeof m === 'string' && m.trim())) {
    return NextResponse.json({ error: 'All merchants must be non-empty strings' }, { status: 400 })
  }

  const db = getDb()
  const updated = mergeMerchants(db, merchants, target.trim())
  return NextResponse.json({ updated })
}
