'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { HealthScore } from '@/components/insights/health-score'
import { IncomeOutflowChart } from '@/components/insights/income-outflow-chart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Receipt, BarChart3, CreditCard, X, AlertCircle } from 'lucide-react'
import type { InsightsResponse, Insight } from '@/lib/insights/types'

const severityColor: Record<string, string> = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

const typeLabel: Record<string, string> = { behavioral_shift: 'Behavior', money_leak: 'Leak', projection: 'Trend' }

function InsightCard({ insight, expanded, onToggle }: { insight: Insight; expanded: boolean; onToggle: () => void }) {
  return (
    <Card
      className={`p-3 border-l-2 ${severityColor[insight.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{typeLabel[insight.type] ?? insight.type}</span>
      </div>
      <p className="text-xs font-medium leading-tight mt-1">{insight.headline}</p>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
          {insight.action && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{insight.action}</p>
          )}
        </div>
      )}
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card className="p-3 border-l-2 border-l-zinc-200 dark:border-l-zinc-700">
      <div className="h-3.5 w-3/4 bg-muted rounded animate-pulse" />
      <div className="h-3 w-1/2 bg-muted rounded animate-pulse mt-1.5" />
    </Card>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    let elapsed = 0
    pollRef.current = setInterval(() => {
      elapsed += 3000
      if (elapsed > 120000) {
        stopPolling()
        setGenerating(false)
        return
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      fetch('/api/insights', { signal: controller.signal })
        .then((res) => res.json())
        .then((json: InsightsResponse) => {
          clearTimeout(timeout)
          setData(json)
          if (json.status === 'ready') {
            stopPolling()
            setGenerating(false)
          }
        })
        .catch(() => {
          clearTimeout(timeout)
        })
    }, 3000)
  }, [stopPolling])

  const fetchInsights = useCallback((refresh = false) => {
    // Cancel any in-flight request
    abortRef.current?.abort()
    stopPolling()

    const controller = new AbortController()
    abortRef.current = controller
    // 15s timeout for each individual fetch
    const timeout = setTimeout(() => controller.abort(), 15000)

    setLoading(true)
    setError(false)

    fetch(`/api/insights${refresh ? '?refresh=true' : ''}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((json: InsightsResponse) => {
        clearTimeout(timeout)
        setData(json)
        setLoading(false)

        if (json.status === 'generating') {
          setGenerating(true)
          startPolling()
        } else {
          setGenerating(false)
        }
      })
      .catch((err) => {
        clearTimeout(timeout)
        if (err.name === 'AbortError') return
        setLoading(false)
        setError(true)
      })
  }, [stopPolling, startPolling])

  useEffect(() => {
    setTimeout(() => fetchInsights(), 0)
    return () => {
      stopPolling()
      abortRef.current?.abort()
    }
  }, [fetchInsights, stopPolling])

  const handleDismiss = (insightId: string) => {
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightId }),
    })
      .then(() => {
        setData((prev) => {
          if (!prev) return prev
          const filtered = prev.insights.filter((i) => i.id !== insightId)
          return { ...prev, insights: filtered, dismissedCount: prev.dismissedCount + 1 }
        })
      })
      .catch(() => {})
  }

  const handleClearDismissals = () => {
    fetch('/api/insights/dismiss', { method: 'DELETE' })
      .then(() => fetchInsights())
      .catch(() => {})
  }

  const insights = data?.insights ?? []

  const hasContent = data && (data.health || insights.length > 0)
  const isEmpty = data && !generating && !data.health && insights.length === 0
  const hasMonthlyFlow = data?.monthlyFlow && data.monthlyFlow.length > 0

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Insights</h1>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => fetchInsights(true)}
          disabled={loading && !data}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${(loading && !data) || generating ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {error && !data && (
        <div className="text-center py-16 space-y-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="text-xs text-muted-foreground">Could not load insights.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchInsights()}>
            Retry
          </Button>
        </div>
      )}

      {/* Initial loading (no data yet) */}
      {loading && !data && !error && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state (data loaded, nothing to show, not generating) */}
      {isEmpty && !hasMonthlyFlow && (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm font-medium">No insights yet</p>
          <p className="text-xs text-muted-foreground">Upload bank statements to see spending analysis.</p>
          <Link href="/transactions">
            <Button variant="outline" size="sm" className="mt-3">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Transactions
            </Button>
          </Link>
        </div>
      )}

      {/* Main content: show when we have data OR are generating */}
      {(hasContent || generating || hasMonthlyFlow) && (
        <>
          {/* Generating banner */}
          {generating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Analyzing your finances...
            </div>
          )}

          {data?.health && (
            <section>
              <HealthScore health={data.health} />
            </section>
          )}

          {/* Skeleton health score while generating */}
          {generating && !data?.health && (
            <section>
              <Card className="p-3">
                <div className="h-5 w-16 bg-muted rounded animate-pulse mx-auto" />
                <div className="h-3 w-48 bg-muted rounded animate-pulse mx-auto mt-2" />
              </Card>
            </section>
          )}

          {hasMonthlyFlow && (
            <section>
              <h2 className="text-sm font-medium mb-2">Income vs Outflow</h2>
              <IncomeOutflowChart data={data!.monthlyFlow} />
            </section>
          )}

          {insights.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">AI Insights</h2>
                <div className="flex items-center gap-2">
                  {(data?.dismissedCount ?? 0) > 0 && (
                    <button onClick={handleClearDismissals} className="text-xs text-muted-foreground hover:text-foreground">
                      {data?.dismissedCount} dismissed
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {insights.map((insight) => (
                  <div key={insight.id} className="relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(insight.id) }}
                      className="absolute top-2 right-2 z-10 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <InsightCard
                      insight={insight}
                      expanded={expandedId === insight.id}
                      onToggle={() => setExpandedId(prev => prev === insight.id ? null : insight.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Skeleton insights while generating */}
          {generating && insights.length === 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">AI Insights</h2>
              <div className="space-y-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </section>
          )}

          {insights.length === 0 && !generating && (data?.dismissedCount ?? 0) > 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              All dismissed.{' '}
              <button onClick={handleClearDismissals} className="underline hover:text-foreground">Reset</button>
            </div>
          )}

          <section className="pt-3 border-t flex flex-wrap items-center gap-2">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Reports
              </Button>
            </Link>
            <Link href="/transactions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 mr-1" /> Transactions
              </Button>
            </Link>
            <Link href="/subscriptions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5 mr-1" /> Recurring
              </Button>
            </Link>
            {data?.generatedAt && data.status === 'ready' && (
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </section>
        </>
      )}
    </div>
  )
}
