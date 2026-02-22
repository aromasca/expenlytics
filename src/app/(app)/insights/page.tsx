'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RefreshCw, Receipt, AlertCircle } from 'lucide-react'
import { useInsights, useRegenerateInsights, useDismissInsight } from '@/hooks/use-insights'
import { InsightsHeader } from '@/components/insights/insights-header'
import { InsightsCarousel } from '@/components/insights/insights-carousel'

export default function InsightsPage() {
  const { data, isLoading: loading, isError: error, refetch } = useInsights()
  const regenerateInsights = useRegenerateInsights()
  const dismissInsight = useDismissInsight()

  const insights = data?.insights ?? []
  const generating = data?.status === 'generating'

  const handleDismiss = (insightId: string) => {
    dismissInsight.mutate({ insightId })
  }

  const handleClearDismissals = () => {
    dismissInsight.mutate({ clearAll: true })
  }

  const handleRefresh = () => {
    regenerateInsights.mutate()
  }

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
          onClick={handleRefresh}
          disabled={loading && !data}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${(loading && !data) || generating ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && !data && (
        <div className="text-center py-16 space-y-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="text-xs text-muted-foreground">Could not load insights.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {loading && !data && !error && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

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

      {(hasContent || generating || hasMonthlyFlow) && (
        <>
          <InsightsHeader
            health={data?.health ?? null}
            monthlyFlow={data?.monthlyFlow ?? []}
            generating={generating}
            generatedAt={data?.generatedAt}
            status={data?.status}
          />

          <InsightsCarousel
            insights={insights}
            generating={generating}
            dismissedCount={data?.dismissedCount ?? 0}
            onDismiss={handleDismiss}
            onClearDismissals={handleClearDismissals}
          />
        </>
      )}
    </div>
  )
}
