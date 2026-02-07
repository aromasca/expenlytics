import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listTransactions } from '@/lib/db/transactions'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const result = listTransactions(db, {
    type: (params.get('type') as 'debit' | 'credit') || undefined,
    category_id: params.get('category_id') ? Number(params.get('category_id')) : undefined,
    search: params.get('search') || undefined,
    sort_by: (params.get('sort_by') as 'date' | 'amount' | 'description') || undefined,
    sort_order: (params.get('sort_order') as 'asc' | 'desc') || undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })

  return NextResponse.json(result)
}
