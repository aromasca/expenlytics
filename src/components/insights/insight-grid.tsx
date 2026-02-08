'use client'

import type { InsightCard } from '@/lib/insights/types'
import { InsightCardComponent } from './insight-card'
import { TrendingUp, Wallet, RefreshCw, ArrowRightLeft } from 'lucide-react'

interface InsightGridProps {
  categoryTrends: InsightCard[]
  lifestyleInflation: InsightCard[]
  recurringCharges: InsightCard[]
  spendingShifts: InsightCard[]
  expandedId: string | null
  onToggle: (id: string) => void
}

const sections = [
  { key: 'categoryTrends' as const, title: 'Category Trends', icon: TrendingUp },
  { key: 'lifestyleInflation' as const, title: 'Lifestyle Inflation', icon: Wallet },
  { key: 'recurringCharges' as const, title: 'Recurring Charges', icon: RefreshCw },
  { key: 'spendingShifts' as const, title: 'Spending Shifts', icon: ArrowRightLeft },
]

export function InsightGrid({ categoryTrends, lifestyleInflation, recurringCharges, spendingShifts, expandedId, onToggle }: InsightGridProps) {
  const data = { categoryTrends, lifestyleInflation, recurringCharges, spendingShifts }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sections.map(({ key, title, icon: Icon }) => (
        <div key={key}>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">{title}</h3>
          </div>
          {data[key].length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes detected</p>
          ) : (
            <div className="space-y-1.5">
              {data[key].slice(0, 3).map((insight) => (
                <InsightCardComponent
                  key={insight.id}
                  insight={insight}
                  expanded={expandedId === insight.id}
                  onToggle={() => onToggle(insight.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
