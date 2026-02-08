'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { InsightGrid } from '@/components/insights/insight-grid'
import { InsightCardComponent } from '@/components/insights/insight-card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Receipt, BarChart3, CreditCard, ChevronLeft, ChevronRight, X, ChevronDown } from 'lucide-react'
import type { InsightsResponse } from '@/lib/insights/types'

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statsOpen, setStatsOpen] = useState(true)

  const fetchInsights = () => {
    setLoading(true)
    fetch('/api/insights')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setCarouselIndex(0)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchInsights()
  }, [])

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const handleDismiss = (insightId: string) => {
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightId }),
    })
      .then(() => {
        setData((prev) => {
          if (!prev) return prev
          const filtered = prev.llmInsights.filter((i) => i.id !== insightId)
          return { ...prev, llmInsights: filtered, dismissedCount: prev.dismissedCount + 1 }
        })
        setCarouselIndex((prev) => Math.min(prev, Math.max(0, (data?.llmInsights.length ?? 1) - 2)))
      })
      .catch(() => {})
  }

  const handleClearDismissals = () => {
    fetch('/api/insights/dismiss', { method: 'DELETE' })
      .then(() => fetchInsights())
      .catch(() => {})
  }

  const llmInsights = data?.llmInsights ?? []
  const hasStats = data && (
    data.categoryTrends.length > 0 ||
    data.lifestyleInflation.length > 0 ||
    data.recurringCharges.length > 0 ||
    data.spendingShifts.length > 0
  )
  const hasAny = llmInsights.length > 0 || hasStats

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Insights</h1>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={fetchInsights}
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

      {!loading && !hasAny && (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm font-medium">No insights yet</p>
          <p className="text-xs text-muted-foreground">
            Upload bank statements to see spending patterns.
          </p>
          <Link href="/transactions">
            <Button variant="outline" size="sm" className="mt-3">
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Transactions
            </Button>
          </Link>
        </div>
      )}

      {data && hasAny && (
        <>
          {llmInsights.length > 0 && (() => {
            const pageSize = 3
            const pageCount = Math.ceil(llmInsights.length / pageSize)
            const page = Math.min(carouselIndex, pageCount - 1)
            const visible = llmInsights.slice(page * pageSize, page * pageSize + pageSize)
            return (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={page === 0}
                      onClick={() => setCarouselIndex((i) => i - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, llmInsights.length)} / {llmInsights.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={page >= pageCount - 1}
                      onClick={() => setCarouselIndex((i) => i + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {(data.dismissedCount ?? 0) > 0 && (
                    <button
                      onClick={handleClearDismissals}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {data.dismissedCount} dismissed
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {visible.map((insight) => (
                    <div key={insight.id} className="relative group">
                      <button
                        onClick={() => handleDismiss(insight.id)}
                        className="absolute top-2 right-2 z-10 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        title="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <InsightCardComponent
                        insight={insight}
                        expanded={expandedId === insight.id}
                        onToggle={() => handleToggle(insight.id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

          {llmInsights.length === 0 && (data.dismissedCount ?? 0) > 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              All dismissed.{' '}
              <button onClick={handleClearDismissals} className="underline hover:text-foreground">
                Reset
              </button>
            </div>
          )}

          {hasStats && (
            <section>
              <button
                onClick={() => setStatsOpen((o) => !o)}
                className="flex items-center gap-1.5 w-full text-left"
              >
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${statsOpen ? '' : '-rotate-90'}`} />
                <h2 className="text-sm font-medium">Statistical Analysis</h2>
              </button>
              {statsOpen && (
                <div className="mt-3">
                  <InsightGrid
                    categoryTrends={data.categoryTrends}
                    lifestyleInflation={data.lifestyleInflation}
                    recurringCharges={data.recurringCharges}
                    spendingShifts={data.spendingShifts}
                    expandedId={expandedId}
                    onToggle={handleToggle}
                  />
                </div>
              )}
            </section>
          )}

          <section className="pt-3 border-t flex flex-wrap items-center gap-2">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                Reports
              </Button>
            </Link>
            <Link href="/transactions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <Receipt className="h-3.5 w-3.5 mr-1" />
                Transactions
              </Button>
            </Link>
            <Link href="/subscriptions">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                Recurring
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
