import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getCommitments, getCommitmentStatuses, getExcludedMerchants, getCommitmentOverrides } from '@/lib/db/commitments'
import { applyCommitmentOverrides } from '@/lib/commitments'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const db = getDb()

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const startDate = params.get('start_date')
  const endDate = params.get('end_date')

  const excludedMerchants = getExcludedMerchants(db)
  const statuses = getCommitmentStatuses(db)

  const allGroups = getCommitments(db, {
    start_date: startDate && DATE_RE.test(startDate) ? startDate : undefined,
    end_date: endDate && DATE_RE.test(endDate) ? endDate : undefined,
    excludeMerchants: excludedMerchants,
  })

  const overrides = getCommitmentOverrides(db)
  applyCommitmentOverrides(allGroups, overrides)

  const activeGroups = []
  const endedGroups = []

  for (const g of allGroups) {
    const entry = statuses.get(g.merchantName)
    if (entry?.status === 'ended') {
      const hasUnexpected = g.lastDate > entry.statusChangedAt
      endedGroups.push({ ...g, statusChangedAt: entry.statusChangedAt, unexpectedActivity: hasUnexpected })
    } else {
      activeGroups.push(g)
    }
  }

  const excludedList = []
  for (const [merchant, entry] of statuses) {
    if (entry.status === 'not_recurring') {
      excludedList.push({ merchant, excludedAt: entry.statusChangedAt })
    }
  }

  const activeMonthly = activeGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
  const endedWasMonthly = endedGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)

  const trendData = computeTrendData(activeGroups)

  // Strip internal _transactionData before sending response
  const stripInternal = (g: typeof allGroups[number]) => {
    const { _transactionData, ...rest } = g
    return rest
  }

  return NextResponse.json({
    activeGroups: activeGroups.map(stripInternal),
    endedGroups: endedGroups.map(stripInternal),
    excludedMerchants: excludedList,
    summary: {
      activeCount: activeGroups.length,
      activeMonthly: Math.round(activeMonthly * 100) / 100,
      endedCount: endedGroups.length,
      endedWasMonthly: Math.round(endedWasMonthly * 100) / 100,
      excludedCount: excludedList.length,
    },
    trendData,
  })
}

function computeTrendData(groups: Array<{ firstDate: string; lastDate: string; estimatedMonthlyAmount: number }>) {
  if (groups.length === 0) return []

  let minDate = groups[0].firstDate
  let maxDate = groups[0].lastDate
  for (const g of groups) {
    if (g.firstDate < minDate) minDate = g.firstDate
    if (g.lastDate > maxDate) maxDate = g.lastDate
  }

  const months: string[] = []
  const start = new Date(minDate.slice(0, 7) + '-01')
  const end = new Date(maxDate.slice(0, 7) + '-01')
  const cursor = new Date(start)
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months.map(month => {
    let amount = 0
    for (const g of groups) {
      const gStart = g.firstDate.slice(0, 7)
      const gEnd = g.lastDate.slice(0, 7)
      if (month >= gStart && month <= gEnd) {
        amount += g.estimatedMonthlyAmount
      }
    }
    return { month, amount: Math.round(amount * 100) / 100 }
  })
}
