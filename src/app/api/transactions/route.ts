import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTransactions, deleteTransactions, bulkUpdateType, bulkUpdateClass, bulkUpdateCategory } from '@/lib/db/transactions'
import { setMerchantCategory } from '@/lib/db/merchant-categories'
import { deleteOrphanedDocuments } from '@/lib/db/documents'

const VALID_TYPES = ['debit', 'credit'] as const
const VALID_CLASSES = ['purchase', 'payment', 'refund', 'fee', 'interest', 'transfer'] as const

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  // Fetch specific transactions by ID list (used by recurring row detail)
  const idsParam = params.get('ids')
  if (idsParam) {
    const ids = idsParam.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
    if (ids.length === 0) return NextResponse.json({ transactions: [] })
    const placeholders = ids.map(() => '?').join(', ')
    const rows = db.prepare(`
      SELECT id, date, description, amount, type FROM transactions WHERE id IN (${placeholders})
    `).all(...ids)
    return NextResponse.json({ transactions: rows })
  }

  const VALID_SORT_BY = ['date', 'amount', 'description'] as const
  const VALID_SORT_ORDER = ['asc', 'desc'] as const

  const typeParam = params.get('type')
  const type = VALID_TYPES.includes(typeParam as typeof VALID_TYPES[number])
    ? typeParam as 'debit' | 'credit'
    : undefined

  const sortByParam = params.get('sort_by')
  const sortOrderParam = params.get('sort_order')
  const sort_by = VALID_SORT_BY.includes(sortByParam as typeof VALID_SORT_BY[number])
    ? sortByParam as 'date' | 'amount' | 'description'
    : undefined
  const sort_order = VALID_SORT_ORDER.includes(sortOrderParam as typeof VALID_SORT_ORDER[number])
    ? sortOrderParam as 'asc' | 'desc'
    : undefined

  const classParam = params.get('transaction_class')
  const transaction_class = VALID_CLASSES.includes(classParam as typeof VALID_CLASSES[number])
    ? classParam as string
    : undefined

  const result = listTransactions(db, {
    type,
    transaction_class,
    category_id: params.get('category_id') ? Number(params.get('category_id')) : undefined,
    category_ids: params.get('category_ids') ? params.get('category_ids')!.split(',').map(Number) : undefined,
    search: params.get('search') || undefined,
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
    document_id: params.get('document_id') ? Number(params.get('document_id')) : undefined,
    sort_by,
    sort_order,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })

  return NextResponse.json(result)
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { ids, category_id, type, transaction_class } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }
  if (!ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
    return NextResponse.json({ error: 'ids must be integers' }, { status: 400 })
  }

  const fields = [category_id, type, transaction_class].filter(f => f !== undefined)
  if (fields.length !== 1) {
    return NextResponse.json({ error: 'Provide exactly one of: category_id, type, transaction_class' }, { status: 400 })
  }

  const db = getDb()
  let updated = 0

  if (category_id !== undefined) {
    if (typeof category_id !== 'number') {
      return NextResponse.json({ error: 'category_id must be a number' }, { status: 400 })
    }
    updated = bulkUpdateCategory(db, ids, category_id)

    // Propagate manual override to merchant classification memory
    const placeholders = ids.map(() => '?').join(', ')
    const rows = db.prepare(`SELECT DISTINCT normalized_merchant FROM transactions WHERE id IN (${placeholders}) AND normalized_merchant IS NOT NULL`).all(...ids) as { normalized_merchant: string }[]
    for (const row of rows) {
      setMerchantCategory(db, row.normalized_merchant, category_id, 'manual', 1.0)
    }
  }

  if (type !== undefined) {
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    updated = bulkUpdateType(db, ids, type)
  }

  if (transaction_class !== undefined) {
    if (!(VALID_CLASSES as readonly string[]).includes(transaction_class)) {
      return NextResponse.json({ error: `transaction_class must be one of: ${VALID_CLASSES.join(', ')}` }, { status: 400 })
    }
    updated = bulkUpdateClass(db, ids, transaction_class)
  }

  return NextResponse.json({ updated })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json()
  const ids: number[] = body.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  if (!ids.every(id => typeof id === 'number' && Number.isInteger(id))) {
    return NextResponse.json({ error: 'ids must be integers' }, { status: 400 })
  }

  const db = getDb()
  const deleted = deleteTransactions(db, ids)
  deleteOrphanedDocuments(db)
  return NextResponse.json({ deleted })
}
