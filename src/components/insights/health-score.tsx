'use client'

import type { HealthAssessment } from '@/lib/insights/types'

const colorMap = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
}

const sentimentColor = {
  good: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-foreground',
  bad: 'text-red-600 dark:text-red-400',
}

const trendArrow = { up: '\u2191', down: '\u2193', stable: '\u2192' }

export function HealthScore({ health }: { health: HealthAssessment }) {
  return (
    <div className="space-y-2" data-walkthrough="health-score">
      <div className="flex items-baseline gap-3">
        <span className={`text-4xl font-semibold tabular-nums ${colorMap[health.color]}`}>
          {health.score}
        </span>
        <span className="text-sm text-muted-foreground">{health.summary}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {health.metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1">
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
            <span className={`text-sm tabular-nums ${sentimentColor[m.sentiment]}`}>
              {m.value}
            </span>
            <span className={`text-[11px] ${sentimentColor[m.sentiment]}`}>
              {trendArrow[m.trend]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
