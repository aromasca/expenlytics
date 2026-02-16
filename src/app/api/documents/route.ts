import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listDocumentsWithCounts } from '@/lib/db/documents'

const VALID_SORT_BY = ['filename', 'uploaded_at', 'document_type', 'status', 'actual_transaction_count'] as const
const VALID_SORT_ORDER = ['asc', 'desc'] as const

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const sortBy = searchParams.get('sort_by') ?? 'uploaded_at'
  const sortOrder = searchParams.get('sort_order') ?? 'desc'

  const validatedSortBy = (VALID_SORT_BY as readonly string[]).includes(sortBy)
    ? sortBy as typeof VALID_SORT_BY[number]
    : 'uploaded_at'
  const validatedSortOrder = (VALID_SORT_ORDER as readonly string[]).includes(sortOrder)
    ? sortOrder as 'asc' | 'desc'
    : 'desc'

  const db = getDb()
  const documents = listDocumentsWithCounts(db, validatedSortBy, validatedSortOrder)
  return NextResponse.json(documents)
}
