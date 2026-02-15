'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import type { PatternCard } from '@/lib/insights/types'

const severityColor = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

export function PatternGrid({ patterns }: { patterns: PatternCard[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (patterns.length === 0) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {patterns.map((p) => (
        <Card
          key={p.id}
          className={`p-3 border-l-2 ${severityColor[p.severity]} cursor-pointer hover:bg-muted/50 transition-colors`}
          onClick={() => setExpandedId(prev => prev === p.id ? null : p.id)}
        >
          <p className="text-xs font-medium leading-tight">{p.headline}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums mt-1">{p.metric}</p>
          {expandedId === p.id && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{p.explanation}</p>
          )}
        </Card>
      ))}
    </div>
  )
}
