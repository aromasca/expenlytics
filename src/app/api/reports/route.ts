import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  getSpendingSummary,
  getSpendingOverTime,
  getCategoryBreakdown,
  getSpendingTrend,
  getTopTransactions,
} from '@/lib/db/reports'
import type { ReportFilters } from '@/lib/db/reports'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const filters: ReportFilters = {
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
    type: (params.get('type') as 'debit' | 'credit') || undefined,
    document_id: params.get('document_id') ? Number(params.get('document_id')) : undefined,
    category_ids: params.get('category_ids') ? params.get('category_ids')!.split(',').map(Number) : undefined,
  }

  const VALID_GROUP_BY = ['month', 'quarter', 'year'] as const
  const groupByParam = params.get('group_by')
  const groupBy = VALID_GROUP_BY.includes(groupByParam as typeof VALID_GROUP_BY[number])
    ? groupByParam as 'month' | 'quarter' | 'year'
    : 'month'

  const summary = getSpendingSummary(db, filters)
  const spendingOverTime = getSpendingOverTime(db, filters, groupBy)
  const categoryBreakdown = getCategoryBreakdown(db, filters)
  const trend = getSpendingTrend(db, filters)
  const topTransactions = getTopTransactions(db, filters, 10)

  return NextResponse.json({
    summary,
    spendingOverTime,
    categoryBreakdown,
    trend,
    topTransactions,
  })
}
