import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { updateTransactionCategory } from '@/lib/db/transactions'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { category_id } = body

  if (!category_id || typeof category_id !== 'number') {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }

  const db = getDb()
  updateTransactionCategory(db, Number(id), category_id, true)

  return NextResponse.json({ success: true })
}
