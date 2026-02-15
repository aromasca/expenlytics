import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { buildCompactData } from '@/lib/insights/compact-data'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'
import { analyzeHealthAndPatterns, analyzeDeepInsights } from '@/lib/claude/analyze-finances'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import { getModelForTask } from '@/lib/claude/models'
import type { InsightsResponse, HealthAssessment, PatternCard, DeepInsight } from '@/lib/insights/types'

export async function GET(request: NextRequest) {
  try {
    const db = getDb()
    const insightsModel = getModelForTask(db, 'insights')

    const refresh = request.nextUrl.searchParams.get('refresh')
    if (refresh === 'true') {
      clearInsightCache(db)
    }

    const monthlyFlow = getMonthlyIncomeVsSpending(db)

    const cacheKey = generateCacheKey(db)
    const cached = getCachedInsights(db, cacheKey)

    let health: HealthAssessment | null = null
    let patterns: PatternCard[] = []
    let insights: DeepInsight[] = []

    if (cached) {
      const cachedData = cached as unknown as { health: HealthAssessment; patterns: PatternCard[]; insights: DeepInsight[] }
      health = cachedData.health
      patterns = cachedData.patterns
      insights = cachedData.insights
    } else {
      const compactData = buildCompactData(db)
      const totalTxns = compactData.monthly.reduce((s, m) => s + m.spending, 0)

      if (totalTxns > 0) {
        try {
          const healthAndPatterns = await analyzeHealthAndPatterns(compactData, insightsModel)
          health = healthAndPatterns.health
          patterns = healthAndPatterns.patterns
        } catch (error) {
          console.error('Health/patterns analysis failed:', error)
        }

        if (health) {
          try {
            insights = await analyzeDeepInsights(compactData, health, insightsModel)
          } catch (error) {
            console.error('Deep insights analysis failed:', error)
          }
        }

        if (health || patterns.length > 0 || insights.length > 0) {
          setCachedInsights(db, cacheKey, { health, patterns, insights })
        }
      }
    }

    const dismissedIds = new Set(getDismissedInsightIds(db))
    const filteredInsights = insights.filter(i => !dismissedIds.has(i.id))
    const dismissedCount = insights.length - filteredInsights.length

    const response: InsightsResponse = {
      health,
      monthlyFlow,
      patterns,
      insights: filteredInsights,
      dismissedCount,
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
