import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getRecurringCharges } from '@/lib/db/recurring'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const groups = getRecurringCharges(db, {
    start_date: params.get('start_date') || undefined,
    end_date: params.get('end_date') || undefined,
  })

  const totalMonthly = groups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
  const totalYearly = totalMonthly * 12

  return NextResponse.json({
    groups,
    summary: {
      totalSubscriptions: groups.length,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalYearly: Math.round(totalYearly * 100) / 100,
    },
  })
}
