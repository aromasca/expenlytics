import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { buildCompactData } from '@/lib/insights/compact-data'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'
import { analyzeFinances } from '@/lib/llm/analyze-finances'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import { getProviderForTask } from '@/lib/llm/factory'
import type { HealthAssessment, MonthlyFlow, Insight } from '@/lib/insights/types'

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

    console.log(`[insights] Starting generation (${providerName}/${model}, ${compactData.monthly.length} months, ${compactData.recent_transactions.length} recent txns)`)

    try {
      const t0 = Date.now()
      const { health, insights } = await analyzeFinances(provider, providerName, compactData, model)
      console.log(`[insights] Analysis complete — score: ${health?.score ?? 'n/a'}, ${insights.length} insights (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
      setCachedInsights(db, cacheKey, { health, insights })
      console.log('[insights] Results cached ✓')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[insights] Analysis FAILED — ${message}`)
    }
  } finally {
    generationInProgress.delete(cacheKey)
  }
}

function buildResponse(
  status: 'ready' | 'generating',
  health: HealthAssessment | null,
  monthlyFlow: MonthlyFlow[],
  allInsights: Insight[],
  dismissedIds: Set<string>,
) {
  const filteredInsights = allInsights.filter(i => !dismissedIds.has(i.id))
  return {
    status,
    health,
    monthlyFlow,
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
      const cachedData = cached as unknown as { health: HealthAssessment; insights: Insight[] }
      return NextResponse.json(
        buildResponse('ready', cachedData.health, monthlyFlow, cachedData.insights, dismissedIds)
      )
    }

    // Generation already in progress — tell client to poll
    if (generationInProgress.has(cacheKey)) {
      return NextResponse.json(
        buildResponse('generating', null, monthlyFlow, [], dismissedIds)
      )
    }

    // Start background generation, return immediately so client can poll
    const promise = generateInsights(cacheKey)
    generationInProgress.set(cacheKey, promise)

    return NextResponse.json(
      buildResponse('generating', null, monthlyFlow, [], dismissedIds)
    )
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
