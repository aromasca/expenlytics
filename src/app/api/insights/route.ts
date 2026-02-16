import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { buildCompactData } from '@/lib/insights/compact-data'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'
import { analyzeHealthAndPatterns, analyzeDeepInsights } from '@/lib/llm/analyze-finances'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import { getProviderForTask } from '@/lib/llm/factory'
import type { InsightsResponse, HealthAssessment, PatternCard, DeepInsight } from '@/lib/insights/types'

// Track in-progress generation to avoid duplicate LLM calls
const generationInProgress = new Map<string, Promise<void>>()

async function generateInsights(cacheKey: string) {
  try {
    const db = getDb()
    const { provider, providerName, model } = getProviderForTask(db, 'insights')
    const compactData = buildCompactData(db)
    const totalTxns = compactData.monthly.reduce((s, m) => s + m.spending, 0)

    if (totalTxns === 0) {
      console.log('[insights] No transactions found — skipping generation')
      return
    }

    console.log(`[insights] Starting generation (${providerName}/${model}, ${compactData.monthly.length} months of data)`)

    let health: HealthAssessment | null = null
    let patterns: PatternCard[] = []
    let insights: DeepInsight[] = []
    let deepInsightsFailed = false

    try {
      console.log('[insights] Health & patterns analysis starting...')
      const t0 = Date.now()
      const healthAndPatterns = await analyzeHealthAndPatterns(provider, providerName, compactData, model)
      health = healthAndPatterns.health
      patterns = healthAndPatterns.patterns
      console.log(`[insights] Health & patterns complete — score: ${health?.score ?? 'n/a'}, ${patterns.length} patterns (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[insights] Health & patterns FAILED — ${message}`)
    }

    if (health) {
      try {
        console.log('[insights] Deep insights analysis starting...')
        const t1 = Date.now()
        insights = await analyzeDeepInsights(provider, providerName, compactData, health, model)
        console.log(`[insights] Deep insights complete — ${insights.length} insights (${((Date.now() - t1) / 1000).toFixed(1)}s)`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[insights] Deep insights FAILED — ${message}`)
        deepInsightsFailed = true
      }
    }

    // Only cache complete results — don't cache partial data when deep insights failed,
    // so the next request retries the LLM call instead of serving empty insights for 24h
    if ((health || patterns.length > 0 || insights.length > 0) && !deepInsightsFailed) {
      setCachedInsights(db, cacheKey, { health, patterns, insights })
      console.log('[insights] Results cached ✓')
    } else if (deepInsightsFailed) {
      console.warn('[insights] Not caching — deep insights failed, will retry on next request')
    }
  } finally {
    generationInProgress.delete(cacheKey)
  }
}

function buildResponse(
  status: 'ready' | 'generating',
  health: HealthAssessment | null,
  monthlyFlow: InsightsResponse['monthlyFlow'],
  patterns: PatternCard[],
  allInsights: DeepInsight[],
  dismissedIds: Set<string>,
): InsightsResponse {
  const filteredInsights = allInsights.filter(i => !dismissedIds.has(i.id))
  return {
    status,
    health,
    monthlyFlow,
    patterns,
    insights: filteredInsights,
    dismissedCount: allInsights.length - filteredInsights.length,
    generatedAt: new Date().toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb()

    const refresh = request.nextUrl.searchParams.get('refresh')
    if (refresh === 'true') {
      clearInsightCache(db)
    }

    const monthlyFlow = getMonthlyIncomeVsSpending(db)
    const cacheKey = generateCacheKey(db)
    const cached = getCachedInsights(db, cacheKey)
    const dismissedIds = new Set(getDismissedInsightIds(db))

    // Cache hit — return immediately
    if (cached) {
      const cachedData = cached as unknown as { health: HealthAssessment; patterns: PatternCard[]; insights: DeepInsight[] }
      return NextResponse.json(
        buildResponse('ready', cachedData.health, monthlyFlow, cachedData.patterns, cachedData.insights, dismissedIds)
      )
    }

    // Generation already in progress — tell client to poll
    if (generationInProgress.has(cacheKey)) {
      return NextResponse.json(
        buildResponse('generating', null, monthlyFlow, [], [], dismissedIds)
      )
    }

    // Start background generation, return immediately so client can poll
    const promise = generateInsights(cacheKey)
    generationInProgress.set(cacheKey, promise)

    return NextResponse.json(
      buildResponse('generating', null, monthlyFlow, [], [], dismissedIds)
    )
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
