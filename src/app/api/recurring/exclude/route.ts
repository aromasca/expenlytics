import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { excludeTransactionFromRecurring, restoreTransactionToRecurring } from '@/lib/db/recurring'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { transactionId, restore } = body ?? {}

  if (typeof transactionId !== 'number' || !Number.isInteger(transactionId)) {
    return NextResponse.json({ error: 'transactionId must be an integer' }, { status: 400 })
  }

  const db = getDb()
  if (restore) {
    restoreTransactionToRecurring(db, transactionId)
  } else {
    excludeTransactionFromRecurring(db, transactionId)
  }
  return NextResponse.json({ success: true })
}
