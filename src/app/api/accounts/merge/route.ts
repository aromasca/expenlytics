import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { mergeAccounts, getAccount } from '@/lib/db/accounts'

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { sourceId, targetId } = body

  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    return NextResponse.json({ error: 'sourceId and targetId must be integers' }, { status: 400 })
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Cannot merge account into itself' }, { status: 400 })
  }

  const db = getDb()
  const source = getAccount(db, sourceId)
  const target = getAccount(db, targetId)
  if (!source || !target) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  mergeAccounts(db, sourceId, targetId)
  return NextResponse.json({ success: true })
}
