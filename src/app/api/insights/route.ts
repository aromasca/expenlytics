import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectCategoryTrends, detectLifestyleInflation, detectRecurringGrowth, detectSpendingShifts, detectLLMInsights } from '@/lib/insights/detection'
import { rankInsights } from '@/lib/insights/ranking'
import { clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import type { InsightsResponse } from '@/lib/insights/types'

export async function GET(request: NextRequest) {
  try {
    const db = getDb()

    // Support cache refresh
    const refresh = request.nextUrl.searchParams.get('refresh')
    if (refresh === 'true') {
      clearInsightCache(db)
    }

    const categoryTrends = detectCategoryTrends(db)
    const lifestyleInflation = detectLifestyleInflation(db)
    const recurringCharges = detectRecurringGrowth(db)
    const spendingShifts = detectSpendingShifts(db)

    // LLM insights — wrapped in try/catch so failures don't break the page
    let llmInsights: InsightsResponse['llmInsights'] = []
    try {
      llmInsights = await detectLLMInsights(db)
    } catch (error) {
      console.error('LLM insights failed (non-fatal):', error)
    }

    // Filter dismissed LLM insights
    const dismissedIds = new Set(getDismissedInsightIds(db))
    const filteredLlm = llmInsights.filter(i => !dismissedIds.has(i.id))
    const dismissedCount = llmInsights.length - filteredLlm.length

    const allInsights = [...filteredLlm, ...categoryTrends, ...lifestyleInflation, ...recurringCharges, ...spendingShifts]
    const hero = rankInsights(allInsights).slice(0, 5)

    const response: InsightsResponse = {
      hero,
      categoryTrends,
      lifestyleInflation,
      recurringCharges,
      spendingShifts,
      llmInsights: filteredLlm,
      dismissedCount,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
