import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { updateTransactionCategory, updateTransactionType, updateTransactionClass } from '@/lib/db/transactions'
import { setMerchantCategory } from '@/lib/db/merchant-categories'

const VALID_TYPES = ['debit', 'credit'] as const
const VALID_CLASSES = ['purchase', 'payment', 'refund', 'fee', 'interest', 'transfer'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { category_id, type, transaction_class } = body

  // Must provide at least one field
  if (category_id === undefined && type === undefined && transaction_class === undefined) {
    return NextResponse.json({ error: 'At least one of category_id, type, or transaction_class is required' }, { status: 400 })
  }

  const db = getDb()
  const txnId = Number(id)

  if (category_id !== undefined) {
    if (typeof category_id !== 'number') {
      return NextResponse.json({ error: 'category_id must be a number' }, { status: 400 })
    }
    updateTransactionCategory(db, txnId, category_id, true)

    // Propagate manual override to merchant classification memory
    const txn = db.prepare('SELECT normalized_merchant FROM transactions WHERE id = ?').get(txnId) as { normalized_merchant: string | null } | undefined
    if (txn?.normalized_merchant) {
      setMerchantCategory(db, txn.normalized_merchant, category_id, 'manual', 1.0)
    }
  }

  if (type !== undefined) {
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    updateTransactionType(db, txnId, type)
  }

  if (transaction_class !== undefined) {
    if (!(VALID_CLASSES as readonly string[]).includes(transaction_class)) {
      return NextResponse.json({ error: `transaction_class must be one of: ${VALID_CLASSES.join(', ')}` }, { status: 400 })
    }
    updateTransactionClass(db, txnId, transaction_class)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const { deleteTransaction } = await import('@/lib/db/transactions')
  deleteTransaction(db, Number(id))
  return new NextResponse(null, { status: 204 })
}
