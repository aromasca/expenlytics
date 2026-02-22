'use client'

import Link from 'next/link'
import { HealthScore } from '@/components/insights/health-score'
import { IncomeOutflowChart } from '@/components/insights/income-outflow-chart'
import { Button } from '@/components/ui/button'
import { BarChart3, Receipt, CreditCard, Landmark, RefreshCw } from 'lucide-react'
import type { InsightsResponse } from '@/types/insights'

interface InsightsHeaderProps {
  health: InsightsResponse['health']
  monthlyFlow: InsightsResponse['monthlyFlow']
  generating: boolean
  generatedAt?: string
  status?: string
}

function SkeletonGauge() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
      <div className="flex flex-col items-center gap-2">
        <div className="shrink-0 h-[140px] w-[140px] rounded-full border-[7px] border-muted animate-pulse" />
        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2 content-start">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="rounded-lg border px-3 py-2 space-y-1.5">
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            <div className="h-4 w-12 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function InsightsHeader({ health, monthlyFlow, generating, generatedAt, status }: InsightsHeaderProps) {
  const hasMonthlyFlow = monthlyFlow && monthlyFlow.length > 0

  return (
    <>
      {generating && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Analyzing your finances...
        </div>
      )}

      {health && (
        <section>
          <HealthScore health={health} />
        </section>
      )}

      {generating && !health && (
        <section>
          <SkeletonGauge />
        </section>
      )}

      {hasMonthlyFlow && (
        <section>
          <h2 className="text-sm font-medium mb-2">Income vs Outflow</h2>
          <IncomeOutflowChart data={monthlyFlow} />
        </section>
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
        <Link href="/commitments">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 mr-1" /> Commitments
          </Button>
        </Link>
        <Link href="/accounts">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5 mr-1" /> Accounts
          </Button>
        </Link>
        {generatedAt && status === 'ready' && (
          <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
            {new Date(generatedAt).toLocaleString()}
          </span>
        )}
      </section>
    </>
  )
}
