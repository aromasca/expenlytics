'use client'

import type { InsightCard } from '@/lib/insights/types'
import { InsightCardComponent } from './insight-card'

interface InsightHeroProps {
  insights: InsightCard[]
  expandedId: string | null
  onToggle: (id: string) => void
}

export function InsightHero({ insights, expandedId, onToggle }: InsightHeroProps) {
  if (insights.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Top Insights</h2>
      <div className="space-y-3">
        {insights.map((insight) => (
          <InsightCardComponent
            key={insight.id}
            insight={insight}
            expanded={expandedId === insight.id}
            onToggle={() => onToggle(insight.id)}
          />
        ))}
      </div>
    </section>
  )
}
