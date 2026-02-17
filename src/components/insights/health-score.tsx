'use client'

import type { HealthAssessment } from '@/lib/insights/types'

const colorMap = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
}

const dotColor = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
}

const sentimentColor = {
  good: 'text-emerald-600 dark:text-emerald-400',
  neutral: 'text-foreground',
  bad: 'text-red-600 dark:text-red-400',
}

const trendArrow = { up: '\u2191', down: '\u2193', stable: '\u2192' }

export function HealthScore({ health }: { health: HealthAssessment }) {
  return (
    <div className="flex items-center gap-3 flex-wrap" data-walkthrough="health-score">
      <div className="flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${dotColor[health.color]}`} />
        <span className={`text-lg font-semibold tabular-nums ${colorMap[health.color]}`}>
          {health.score}
        </span>
        <span className="text-xs text-muted-foreground">{health.summary}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {health.metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-1 rounded border px-2 py-0.5">
            <span className="text-[10px] text-muted-foreground">{m.label}</span>
            <span className={`text-xs tabular-nums ${sentimentColor[m.sentiment]}`}>
              {m.value}
            </span>
            <span className={`text-[10px] ${sentimentColor[m.sentiment]}`}>
              {trendArrow[m.trend]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
