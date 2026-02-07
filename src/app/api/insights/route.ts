import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectCategoryTrends, detectLifestyleInflation, detectRecurringGrowth, detectSpendingShifts } from '@/lib/insights/detection'
import { rankInsights } from '@/lib/insights/ranking'
import type { InsightsResponse } from '@/lib/insights/types'

export async function GET() {
  try {
    const db = getDb()

    const categoryTrends = detectCategoryTrends(db)
    const lifestyleInflation = detectLifestyleInflation(db)
    const recurringCharges = detectRecurringGrowth(db)
    const spendingShifts = detectSpendingShifts(db)

    const allInsights = [...categoryTrends, ...lifestyleInflation, ...recurringCharges, ...spendingShifts]
    const hero = rankInsights(allInsights).slice(0, 5)

    const response: InsightsResponse = {
      hero,
      categoryTrends,
      lifestyleInflation,
      recurringCharges,
      spendingShifts,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
