'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { HealthScore } from '@/components/insights/health-score'
import { IncomeOutflowChart } from '@/components/insights/income-outflow-chart'
import { PatternGrid } from '@/components/insights/pattern-grid'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RefreshCw, Receipt, BarChart3, CreditCard, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { InsightsResponse, DeepInsight } from '@/lib/insights/types'

const severityColor = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

function InsightCard({ insight, expanded, onToggle }: { insight: DeepInsight; expanded: boolean; onToggle: () => void }) {
  return (
    <Card
      className={`p-3 border-l-2 ${severityColor[insight.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
      onClick={onToggle}
    >
      <p className="text-xs font-medium leading-tight">{insight.headline}</p>
      <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{insight.key_metric}</p>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.explanation}</p>
          {insight.action_suggestion && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{insight.action_suggestion}</p>
          )}
        </div>
      )}
    </Card>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchInsights = (refresh = false) => {
    setLoading(true)
    fetch(`/api/insights${refresh ? '?refresh=true' : ''}`)
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setCarouselIndex(0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchInsights() }, [])

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
  const pageSize = 3
  const pageCount = Math.max(1, Math.ceil(insights.length / pageSize))
  const page = Math.min(carouselIndex, pageCount - 1)
  const visibleInsights = insights.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Insights</h1>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => fetchInsights(true)}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && !data?.health && insights.length === 0 && (data?.patterns ?? []).length === 0 && (
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

      {data && (data.health || insights.length > 0 || (data.patterns ?? []).length > 0) && (
        <>
          {data.health && (
            <section>
              <HealthScore health={data.health} />
            </section>
          )}

          {data.monthlyFlow && data.monthlyFlow.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">Income vs Outflow</h2>
              <IncomeOutflowChart data={data.monthlyFlow} />
            </section>
          )}

          {data.patterns && data.patterns.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">Patterns</h2>
              <PatternGrid patterns={data.patterns} />
            </section>
          )}

          {insights.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">AI Insights</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page === 0} onClick={() => setCarouselIndex(i => i - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, insights.length)} / {insights.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pageCount - 1} onClick={() => setCarouselIndex(i => i + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  {(data.dismissedCount ?? 0) > 0 && (
                    <button onClick={handleClearDismissals} className="text-xs text-muted-foreground hover:text-foreground ml-2">
                      {data.dismissedCount} dismissed
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {visibleInsights.map((insight) => (
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

          {insights.length === 0 && (data.dismissedCount ?? 0) > 0 && (
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
            {data.generatedAt && (
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
