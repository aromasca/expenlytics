import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { renameAccount, getAccount } from '@/lib/db/accounts'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const accountId = parseInt(id, 10)
  if (isNaN(accountId)) {
    return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 })
  }

  const body = await request.json()
  const { name } = body
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const db = getDb()
  const account = getAccount(db, accountId)
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  renameAccount(db, accountId, name.trim())
  return NextResponse.json({ success: true })
}
