'use client'

import { useState, useEffect } from 'react'
import type { HealthAssessment } from '@/lib/insights/types'

const RADIUS = 58
const STROKE = 7
const SIZE = 140
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const gradientColors = {
  green: { from: '#34D399', to: '#059669' },
  yellow: { from: '#FBBF24', to: '#D97706' },
  red: { from: '#F87171', to: '#DC2626' },
}

const scoreColor: Record<string, string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
}

const sentimentText: Record<string, string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  neutral: 'text-foreground',
  bad: 'text-red-700 dark:text-red-300',
}

const sentimentBorder: Record<string, string> = {
  good: 'border-l-emerald-500',
  neutral: 'border-l-zinc-300 dark:border-l-zinc-600',
  bad: 'border-l-red-500',
}

const sentimentBg: Record<string, string> = {
  good: 'bg-emerald-50/60 dark:bg-emerald-950/20',
  neutral: '',
  bad: 'bg-red-50/60 dark:bg-red-950/20',
}

const trendConfig: Record<string, { arrow: string; good: string; neutral: string; bad: string }> = {
  up: {
    arrow: '\u2191',
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    bad: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  down: {
    arrow: '\u2193',
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    bad: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  stable: {
    arrow: '\u2192',
    good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    bad: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
}

export function HealthScore({ health }: { health: HealthAssessment }) {
  const [mounted, setMounted] = useState(false)
  const [displayScore, setDisplayScore] = useState(0)

  const targetOffset = CIRCUMFERENCE - (health.score / 100) * CIRCUMFERENCE
  const gradient = gradientColors[health.color]

  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const trackStroke = isDark ? '#27272A' : '#F0F0F0'

  useEffect(() => {
    setMounted(true)

    let frame: number
    const start = performance.now()
    const duration = 1200
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(eased * health.score))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [health.score])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start" data-walkthrough="health-score">
      <div className="flex flex-col items-center gap-2">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            <defs>
              <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={gradient.from} />
                <stop offset="100%" stopColor={gradient.to} />
              </linearGradient>
            </defs>
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              fill="none" stroke={trackStroke} strokeWidth={STROKE}
            />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
              fill="none"
              stroke="url(#gauge-grad)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={mounted ? targetOffset : CIRCUMFERENCE}
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-3xl font-bold tabular-nums ${scoreColor[health.color]}`}>{displayScore}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-snug text-center max-w-[180px]">{health.summary}</p>
      </div>

      {health.metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 content-start">
          {health.metrics.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg border border-l-2 ${sentimentBorder[m.sentiment]} ${sentimentBg[m.sentiment]} px-3 py-2`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground truncate">{m.label}</p>
                <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 leading-none shrink-0 ${trendConfig[m.trend][m.sentiment]}`}>
                  {trendConfig[m.trend].arrow}
                </span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${sentimentText[m.sentiment]}`}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
