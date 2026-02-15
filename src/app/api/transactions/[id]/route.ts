import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { updateTransactionCategory, deleteTransaction } from '@/lib/db/transactions'
import { setMerchantCategory } from '@/lib/db/merchant-categories'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { category_id } = body

  if (!category_id || typeof category_id !== 'number') {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }

  const db = getDb()
  updateTransactionCategory(db, Number(id), category_id, true)

  // Propagate manual override to merchant classification memory
  const txn = db.prepare('SELECT normalized_merchant FROM transactions WHERE id = ?').get(Number(id)) as { normalized_merchant: string | null } | undefined
  if (txn?.normalized_merchant) {
    setMerchantCategory(db, txn.normalized_merchant, category_id, 'manual', 1.0)
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  deleteTransaction(db, Number(id))
  return new NextResponse(null, { status: 204 })
}
