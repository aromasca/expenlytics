import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { excludeTransactionFromCommitments, restoreTransactionToCommitments } from '@/lib/db/commitments'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { transactionId, restore } = body ?? {}

  if (typeof transactionId !== 'number' || !Number.isInteger(transactionId)) {
    return NextResponse.json({ error: 'transactionId must be an integer' }, { status: 400 })
  }

  const db = getDb()
  if (restore) {
    restoreTransactionToCommitments(db, transactionId)
  } else {
    excludeTransactionFromCommitments(db, transactionId)
  }
  return NextResponse.json({ success: true })
}
