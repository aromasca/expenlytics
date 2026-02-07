'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { InsightHero } from '@/components/insights/insight-hero'
import { InsightGrid } from '@/components/insights/insight-grid'
import { Button } from '@/components/ui/button'
import { RefreshCw, Receipt, BarChart3, CreditCard } from 'lucide-react'
import type { InsightsResponse } from '@/lib/insights/types'

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchInsights = () => {
    setLoading(true)
    fetch('/api/insights')
      .then((res) => res.json())
      .then((json) => {
        setData(json)
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

  const hasAnyInsights = data && (
    data.hero.length > 0 ||
    data.categoryTrends.length > 0 ||
    data.lifestyleInflation.length > 0 ||
    data.recurringCharges.length > 0 ||
    data.spendingShifts.length > 0
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Financial health patterns and trends
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

      {!loading && !hasAnyInsights && (
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

      {data && hasAnyInsights && (
        <>
          <InsightHero
            insights={data.hero}
            expandedId={expandedId}
            onToggle={handleToggle}
          />

          <InsightGrid
            categoryTrends={data.categoryTrends}
            lifestyleInflation={data.lifestyleInflation}
            recurringCharges={data.recurringCharges}
            spendingShifts={data.spendingShifts}
            expandedId={expandedId}
            onToggle={handleToggle}
          />

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
