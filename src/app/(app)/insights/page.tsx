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
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered financial analysis
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInsights}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && !hasAny && (
        <div className="text-center py-20 space-y-3">
          <p className="text-lg font-medium">No insights yet</p>
          <p className="text-sm text-muted-foreground">
            Upload some bank statements to start seeing spending patterns and trends.
          </p>
          <Link href="/transactions">
            <Button variant="outline" className="mt-4">
              <Receipt className="h-4 w-4 mr-2" />
              Go to Transactions
            </Button>
          </Link>
        </div>
      )}

      {data && hasAny && (
        <>
          {/* LLM Insights — paginated, 3 per page */}
          {llmInsights.length > 0 && (() => {
            const pageSize = 3
            const pageCount = Math.ceil(llmInsights.length / pageSize)
            const page = Math.min(carouselIndex, pageCount - 1)
            const visible = llmInsights.slice(page * pageSize, page * pageSize + pageSize)
            return (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 0}
                      onClick={() => setCarouselIndex((i) => i - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, llmInsights.length)} of {llmInsights.length}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= pageCount - 1}
                      onClick={() => setCarouselIndex((i) => i + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  {(data.dismissedCount ?? 0) > 0 && (
                    <button
                      onClick={handleClearDismissals}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      {data.dismissedCount} dismissed &mdash; reset
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {visible.map((insight) => (
                    <div key={insight.id} className="relative">
                      <button
                        onClick={() => handleDismiss(insight.id)}
                        className="absolute top-3 right-3 z-10 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Dismiss this insight"
                      >
                        <X className="h-4 w-4" />
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

          {/* Dismissed count when no LLM insights left */}
          {llmInsights.length === 0 && (data.dismissedCount ?? 0) > 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              All AI insights dismissed.{' '}
              <button
                onClick={handleClearDismissals}
                className="underline hover:text-foreground"
              >
                Reset {data.dismissedCount} dismissed
              </button>
            </div>
          )}

          {/* Statistical Analysis — collapsible */}
          {hasStats && (
            <section>
              <button
                onClick={() => setStatsOpen((o) => !o)}
                className="flex items-center gap-2 w-full text-left"
              >
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${statsOpen ? '' : '-rotate-90'}`} />
                <h2 className="text-lg font-semibold">Statistical Analysis</h2>
              </button>
              {statsOpen && (
                <div className="mt-4">
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

          {/* Quick Actions */}
          <section className="pt-4 border-t">
            <div className="flex flex-wrap gap-3">
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Reports
                </Button>
              </Link>
              <Link href="/transactions">
                <Button variant="outline" size="sm">
                  <Receipt className="h-4 w-4 mr-2" />
                  Transactions
                </Button>
              </Link>
              <Link href="/subscriptions">
                <Button variant="outline" size="sm">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Subscriptions
                </Button>
              </Link>
            </div>
            {data.generatedAt && (
              <p className="text-xs text-muted-foreground mt-3">
                Last updated: {new Date(data.generatedAt).toLocaleString()}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
