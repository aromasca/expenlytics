import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { buildCompactData } from '@/lib/insights/compact-data'
import { getMonthlyIncomeVsSpending } from '@/lib/db/health'
import { analyzeFinances } from '@/lib/llm/analyze-finances'
import { generateCacheKey, getCachedInsights, setCachedInsights, clearInsightCache, getDismissedInsightIds } from '@/lib/db/insight-cache'
import { getProviderForTask } from '@/lib/llm/factory'
import type { HealthAssessment, MonthlyFlow, Insight } from '@/lib/insights/types'

// Track in-progress generation with timestamps to detect stale/hung promises
const generationInProgress = new Map<string, { promise: Promise<void>; startedAt: number }>()

const GENERATION_TIMEOUT_MS = 180_000 // 3 minutes

function isGenerationStale(key: string): boolean {
  const entry = generationInProgress.get(key)
  if (!entry) return false
  const elapsed = Date.now() - entry.startedAt
  if (elapsed > GENERATION_TIMEOUT_MS) {
    console.error(`[insights] Generation stale (${(elapsed / 1000).toFixed(0)}s), cleaning up`)
    generationInProgress.delete(key)
    return true
  }
  return false
}

async function generateInsights(cacheKey: string) {
  const t0 = Date.now()
  try {
    const db = getDb()
    const { provider, providerName, model } = getProviderForTask(db, 'insights')
    const compactData = buildCompactData(db)
    const totalTxns = compactData.monthly.reduce((s, m) => s + m.spending, 0)

    if (totalTxns === 0) {
      console.log('[insights] No transactions found — skipping generation')
      return
    }

    const payloadKB = (JSON.stringify(compactData).length / 1024).toFixed(1)
    const { active_commitments, commitment_baseline, account_summaries } = compactData
    console.log(`[insights] Starting generation (${providerName}/${model}, ${payloadKB}KB)`)
    console.log(`[insights]   ${compactData.monthly.length} months, ${compactData.recent_transactions.length} recent txns, ${active_commitments.length} commitments ($${commitment_baseline.total_monthly.toFixed(0)}/mo), ${account_summaries.length} accounts`)

    // Race the LLM call against a timeout to prevent hung promises
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM call timed out after ${GENERATION_TIMEOUT_MS / 1000}s`)), GENERATION_TIMEOUT_MS)
    })

    const { health, insights } = await Promise.race([
      analyzeFinances(provider, providerName, compactData, model),
      timeoutPromise,
    ])

    const types = insights.map(i => i.type).join(', ')
    console.log(`[insights] Analysis complete (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    console.log(`[insights]   score: ${health?.score ?? 'n/a'} (${health?.color ?? '?'}), ${insights.length} alerts [${types}]`)
    setCachedInsights(db, cacheKey, { health, insights })
    console.log('[insights] Results cached')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[insights] Generation failed (${((Date.now() - t0) / 1000).toFixed(1)}s): ${message}`)

    // Cache empty result (1h TTL) to prevent retry storm
    try {
      const db = getDb()
      setCachedInsights(db, cacheKey, { health: null, insights: [] }, 1)
    } catch (cacheError) {
      console.error(`[insights] Failed to cache empty result: ${cacheError}`)
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
      console.log('[insights] Cache cleared (manual refresh)')
      clearInsightCache(db)
      generationInProgress.clear()
    }

    const monthlyFlow = getMonthlyIncomeVsSpending(db)
    const cacheKey = generateCacheKey(db)
    const cached = getCachedInsights(db, cacheKey)
    const dismissedIds = new Set(getDismissedInsightIds(db))

    // Cache hit — return immediately
    if (cached) {
      const cachedData = cached as unknown as { health: HealthAssessment; insights: Insight[] }
      console.log(`[insights] Cache hit (key: ${cacheKey.slice(0, 8)}…, ${cachedData.insights.length} alerts, ${dismissedIds.size} dismissed)`)
      return NextResponse.json(
        buildResponse('ready', cachedData.health, monthlyFlow, cachedData.insights, dismissedIds)
      )
    }

    // Generation in progress — check if stale first
    if (generationInProgress.has(cacheKey) && !isGenerationStale(cacheKey)) {
      const entry = generationInProgress.get(cacheKey)!
      const elapsed = ((Date.now() - entry.startedAt) / 1000).toFixed(0)
      console.log(`[insights] Generation in progress (key: ${cacheKey.slice(0, 8)}…, ${elapsed}s elapsed), polling`)
      return NextResponse.json(
        buildResponse('generating', null, monthlyFlow, [], dismissedIds)
      )
    }

    // Start background generation, return immediately so client can poll
    console.log(`[insights] Cache miss (key: ${cacheKey.slice(0, 8)}…), starting background generation`)
    const promise = generateInsights(cacheKey)
    generationInProgress.set(cacheKey, { promise, startedAt: Date.now() })

    return NextResponse.json(
      buildResponse('generating', null, monthlyFlow, [], dismissedIds)
    )
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
