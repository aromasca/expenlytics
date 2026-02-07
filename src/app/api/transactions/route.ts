import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTransactions, deleteTransactions } from '@/lib/db/transactions'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const VALID_TYPES = ['debit', 'credit'] as const
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

  const result = listTransactions(db, {
    type,
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
  return NextResponse.json({ deleted })
}
