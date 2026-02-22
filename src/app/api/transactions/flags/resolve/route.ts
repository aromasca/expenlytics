import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { resolveFlag, resolveFlags } from '@/lib/db/transaction-flags'
import { updateTransactionCategory } from '@/lib/db/transactions'

const VALID_RESOLUTIONS = ['removed', 'kept', 'fixed', 'dismissed'] as const

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { flagId, flagIds, resolution, categoryId } = body

  if (!(VALID_RESOLUTIONS as readonly string[]).includes(resolution)) {
    return NextResponse.json({ error: `resolution must be one of: ${VALID_RESOLUTIONS.join(', ')}` }, { status: 400 })
  }

  const db = getDb()

  // Bulk resolve
  if (Array.isArray(flagIds) && flagIds.length > 0) {
    if (!flagIds.every((id: unknown) => typeof id === 'number')) {
      return NextResponse.json({ error: 'flagIds must be numbers' }, { status: 400 })
    }

    // For 'fixed' with categoryId, update all transaction categories
    if (resolution === 'fixed' && typeof categoryId === 'number') {
      const placeholders = flagIds.map(() => '?').join(', ')
      const flags = db.prepare(
        `SELECT transaction_id FROM transaction_flags WHERE id IN (${placeholders})`
      ).all(...flagIds) as { transaction_id: number }[]
      for (const flag of flags) {
        updateTransactionCategory(db, flag.transaction_id, categoryId, true)
      }
    }

    const updated = resolveFlags(db, flagIds, resolution)
    return NextResponse.json({ success: true, updated })
  }

  // Single resolve
  if (typeof flagId !== 'number') {
    return NextResponse.json({ error: 'flagId or flagIds is required' }, { status: 400 })
  }

  if (resolution === 'fixed' && typeof categoryId === 'number') {
    const flag = db.prepare('SELECT transaction_id FROM transaction_flags WHERE id = ?').get(flagId) as { transaction_id: number } | undefined
    if (flag) {
      updateTransactionCategory(db, flag.transaction_id, categoryId, true)
    }
  }

  resolveFlag(db, flagId, resolution)
  return NextResponse.json({ success: true })
}
