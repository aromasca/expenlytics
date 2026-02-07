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
  { key: 'categoryTrends' as const, title: 'Category Trends', subtitle: 'Spending categories creeping up', icon: TrendingUp },
  { key: 'lifestyleInflation' as const, title: 'Lifestyle Inflation', subtitle: 'Overall spending trajectory', icon: Wallet },
  { key: 'recurringCharges' as const, title: 'Recurring Charges', subtitle: 'Subscription & merchant growth', icon: RefreshCw },
  { key: 'spendingShifts' as const, title: 'Spending Shifts', subtitle: 'Money moving between categories', icon: ArrowRightLeft },
]

export function InsightGrid({ categoryTrends, lifestyleInflation, recurringCharges, spendingShifts, expandedId, onToggle }: InsightGridProps) {
  const data = { categoryTrends, lifestyleInflation, recurringCharges, spendingShifts }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Detailed Analysis</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sections.map(({ key, title, subtitle, icon: Icon }) => (
          <div key={key}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">{title}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
            {data[key].length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No significant changes detected</p>
            ) : (
              <div className="space-y-2">
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
    </section>
  )
}
