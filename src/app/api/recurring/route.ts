import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getRecurringCharges, getDismissedMerchants } from '@/lib/db/recurring'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const startDate = params.get('start_date')
  const endDate = params.get('end_date')

  const allGroups = getRecurringCharges(db, {
    start_date: startDate && DATE_RE.test(startDate) ? startDate : undefined,
    end_date: endDate && DATE_RE.test(endDate) ? endDate : undefined,
  })

  const dismissed = getDismissedMerchants(db)
  const groups = allGroups.filter(g => !dismissed.has(g.merchantName))
  const dismissedGroups = allGroups.filter(g => dismissed.has(g.merchantName))

  const totalMonthly = groups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
  const totalYearly = totalMonthly * 12

  return NextResponse.json({
    groups,
    dismissedGroups,
    summary: {
      totalSubscriptions: groups.length,
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      totalYearly: Math.round(totalYearly * 100) / 100,
    },
  })
}
