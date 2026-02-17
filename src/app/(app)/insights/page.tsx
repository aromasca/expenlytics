'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { HealthScore } from '@/components/insights/health-score'
import { IncomeOutflowChart } from '@/components/insights/income-outflow-chart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  RefreshCw, Receipt, BarChart3, CreditCard, Landmark, X, AlertCircle,
  Activity, Droplets, TrendingUp, ArrowLeftRight, AlertTriangle, Target,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InsightsResponse, Insight } from '@/lib/insights/types'
import { formatCurrencyPrecise } from '@/lib/format'

const severityBorder: Record<string, string> = {
  concerning: 'border-l-red-500',
  notable: 'border-l-amber-500',
  favorable: 'border-l-emerald-500',
  informational: 'border-l-zinc-400',
}

const severityBarColor: Record<string, string> = {
  concerning: 'bg-red-400/30 dark:bg-red-500/25',
  notable: 'bg-amber-400/30 dark:bg-amber-500/25',
  favorable: 'bg-emerald-400/30 dark:bg-emerald-500/25',
  informational: 'bg-foreground/10',
}

const typeLabel: Record<string, string> = {
  behavioral_shift: 'Behavior',
  money_leak: 'Leak',
  projection: 'Trend',
  commitment_drift: 'Drift',
  account_anomaly: 'Anomaly',
  baseline_gap: 'Baseline',
}

const typeIcon: Record<string, LucideIcon> = {
  behavioral_shift: Activity,
  money_leak: Droplets,
  projection: TrendingUp,
  commitment_drift: ArrowLeftRight,
  account_anomaly: AlertTriangle,
  baseline_gap: Target,
}

const typePill: Record<string, string> = {
  behavioral_shift: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  money_leak: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  projection: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  commitment_drift: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  account_anomaly: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  baseline_gap: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

function renderExplanationWithLinks(explanation: string, evidence: Insight['evidence']) {
  const linkMap: Array<{ text: string; href: string }> = []

  for (const merchant of evidence.merchants ?? []) {
    linkMap.push({ text: merchant, href: `/transactions?search=${encodeURIComponent(merchant)}` })
  }
  for (const category of evidence.categories ?? []) {
    linkMap.push({ text: category, href: `/transactions?search=${encodeURIComponent(category)}` })
  }
  for (const account of evidence.accounts ?? []) {
    linkMap.push({ text: account, href: '/accounts' })
  }
  if (evidence.commitment_merchant) {
    linkMap.push({ text: evidence.commitment_merchant, href: '/commitments' })
  }

  if (linkMap.length === 0) return explanation

  linkMap.sort((a, b) => b.text.length - a.text.length)

  type Segment = { type: 'text'; value: string } | { type: 'link'; text: string; href: string }
  let segments: Segment[] = [{ type: 'text', value: explanation }]

  for (const link of linkMap) {
    const newSegments: Segment[] = []
    for (const seg of segments) {
      if (seg.type !== 'text') {
        newSegments.push(seg)
        continue
      }
      const parts = seg.value.split(link.text)
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) newSegments.push({ type: 'text', value: parts[i] })
        if (i < parts.length - 1) newSegments.push({ type: 'link', text: link.text, href: link.href })
      }
    }
    segments = newSegments
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <Link
            key={i}
            href={seg.href}
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.text}
          </Link>
        )
      )}
    </>
  )
}

function StaggerWrapper({ index, children }: { index: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 80)
    return () => clearTimeout(timer)
  }, [index])
  return (
    <div
      className="transition-all duration-400 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      {children}
    </div>
  )
}

function EvidenceBars({ amounts, severity }: { amounts: Record<string, number>; severity: string }) {
  const entries = Object.entries(amounts)
  if (entries.length === 0) return null

  const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)))
  if (maxVal === 0) return null

  const barColor = severityBarColor[severity] ?? 'bg-foreground/10'

  return (
    <div className="space-y-1.5">
      {entries.map(([label, value]) => {
        const isNegative = value < 0
        const pct = (Math.abs(value) / maxVal) * 100
        return (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground w-28 truncate shrink-0 text-right">{label}</span>
            <div className="flex-1 h-4 bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isNegative ? 'bg-red-400/40 dark:bg-red-500/30' : barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`tabular-nums text-[11px] font-medium shrink-0 ${isNegative ? 'text-red-600 dark:text-red-400' : ''}`}>
              {formatCurrencyPrecise(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function EvidenceDetail({ evidence, severity }: { evidence: Insight['evidence']; severity: string }) {
  const hasAmounts = evidence.amounts && Object.keys(evidence.amounts).length > 0
  const hasPeriod = evidence.time_period

  if (!hasAmounts && !hasPeriod) return null

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      {hasPeriod && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">{evidence.time_period}</p>
      )}
      {hasAmounts && <EvidenceBars amounts={evidence.amounts!} severity={severity} />}
    </div>
  )
}

function InsightCard({ insight, expanded, onToggle, onDismiss }: {
  insight: Insight; expanded: boolean; onToggle: () => void; onDismiss: () => void
}) {
  const Icon = typeIcon[insight.type] ?? Activity
  const pill = typePill[insight.type] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'

  return (
    <Card
      className={`group p-3 border-l-[3px] ${severityBorder[insight.severity]} cursor-pointer hover:bg-muted/40 transition-colors`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider rounded-full px-2 py-0.5 ${pill}`}>
          <Icon className="h-2.5 w-2.5" />
          {typeLabel[insight.type] ?? insight.type}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss() }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>
      <p className="text-xs font-medium leading-snug mt-2">{insight.headline}</p>

      {expanded && (
        <div className="mt-2.5 space-y-2.5 border-t pt-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {renderExplanationWithLinks(insight.explanation, insight.evidence)}
          </p>
          <EvidenceDetail evidence={insight.evidence} severity={insight.severity} />
          {insight.action && (
            <div className="flex items-start gap-1.5 rounded-md bg-emerald-50/80 dark:bg-emerald-950/25 border border-emerald-200/60 dark:border-emerald-800/30 px-2.5 py-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 text-xs shrink-0 mt-px">&rarr;</span>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">{insight.action}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
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

function SkeletonCard() {
  return (
    <Card className="p-3 border-l-2 border-l-muted">
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 bg-muted rounded animate-pulse" />
        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-4 w-3/4 bg-muted rounded animate-pulse mt-2" />
      <div className="h-3 w-1/2 bg-muted rounded animate-pulse mt-1.5" />
    </Card>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toggleExpand = (id: string) => {
    const idx = insights.findIndex(i => i.id === id)
    const partnerIdx = idx % 2 === 0 ? idx + 1 : idx - 1
    const partnerId = insights[partnerIdx]?.id

    setExpandedIds(prev => {
      const next = new Set(prev)
      const expanding = !next.has(id)
      if (expanding) {
        next.add(id)
        if (partnerId) next.add(partnerId)
      } else {
        next.delete(id)
        if (partnerId) next.delete(partnerId)
      }
      return next
    })
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    let elapsed = 0
    pollRef.current = setInterval(() => {
      elapsed += 3000
      if (elapsed > 120000) {
        stopPolling()
        setGenerating(false)
        return
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      fetch('/api/insights', { signal: controller.signal })
        .then((res) => res.json())
        .then((json: InsightsResponse) => {
          clearTimeout(timeout)
          setData(json)
          if (json.status === 'ready') {
            stopPolling()
            setGenerating(false)
          }
        })
        .catch(() => {
          clearTimeout(timeout)
        })
    }, 3000)
  }, [stopPolling])

  const fetchInsights = useCallback((refresh = false) => {
    abortRef.current?.abort()
    stopPolling()

    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)

    setLoading(true)
    setError(false)

    fetch(`/api/insights${refresh ? '?refresh=true' : ''}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((json: InsightsResponse) => {
        clearTimeout(timeout)
        setData(json)
        setLoading(false)

        if (json.status === 'generating') {
          setGenerating(true)
          startPolling()
        } else {
          setGenerating(false)
        }
      })
      .catch((err) => {
        clearTimeout(timeout)
        if (err.name === 'AbortError') return
        setLoading(false)
        setError(true)
      })
  }, [stopPolling, startPolling])

  useEffect(() => {
    setTimeout(() => fetchInsights(), 0)
    return () => {
      stopPolling()
      abortRef.current?.abort()
    }
  }, [fetchInsights, stopPolling])

  const handleDismiss = (insightId: string) => {
    fetch('/api/insights/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insightId }),
    })
      .then(() => {
        setData((prev) => {
          if (!prev) return prev
          const filtered = prev.insights.filter((i) => i.id !== insightId)
          return { ...prev, insights: filtered, dismissedCount: prev.dismissedCount + 1 }
        })
      })
      .catch(() => {})
  }

  const handleClearDismissals = () => {
    fetch('/api/insights/dismiss', { method: 'DELETE' })
      .then(() => fetchInsights())
      .catch(() => {})
  }

  const insights = data?.insights ?? []
  const FOLD_COUNT = 6
  const [showAll, setShowAll] = useState(false)
  const visibleInsights = showAll ? insights : insights.slice(0, FOLD_COUNT)

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
          onClick={() => fetchInsights(true)}
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
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchInsights()}>
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
          {generating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Analyzing your finances...
            </div>
          )}

          {data?.health && (
            <section>
              <HealthScore health={data.health} />
            </section>
          )}

          {generating && !data?.health && (
            <section>
              <SkeletonGauge />
            </section>
          )}

          {insights.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">AI Insights</h2>
                <div className="flex items-center gap-2">
                  {(data?.dismissedCount ?? 0) > 0 && (
                    <button onClick={handleClearDismissals} className="text-xs text-muted-foreground hover:text-foreground">
                      {data?.dismissedCount} dismissed
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visibleInsights.map((insight, index) => (
                  <StaggerWrapper key={insight.id} index={index}>
                    <InsightCard
                      insight={insight}
                      expanded={expandedIds.has(insight.id)}
                      onToggle={() => toggleExpand(insight.id)}
                      onDismiss={() => handleDismiss(insight.id)}
                    />
                  </StaggerWrapper>
                ))}
              </div>
              {insights.length > FOLD_COUNT && (
                <button
                  onClick={() => setShowAll(prev => !prev)}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 mt-1"
                >
                  {showAll ? 'Show less' : `Show all ${insights.length} insights`}
                </button>
              )}
            </section>
          )}

          {generating && insights.length === 0 && (
            <section>
              <h2 className="text-sm font-medium mb-2">AI Insights</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </section>
          )}

          {insights.length === 0 && !generating && (data?.dismissedCount ?? 0) > 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              All dismissed.{' '}
              <button onClick={handleClearDismissals} className="underline hover:text-foreground">Reset</button>
            </div>
          )}

          {hasMonthlyFlow && (
            <section>
              <h2 className="text-sm font-medium mb-2">Income vs Outflow</h2>
              <IncomeOutflowChart data={data!.monthlyFlow} />
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
            {data?.generatedAt && data.status === 'ready' && (
              <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                {new Date(data.generatedAt).toLocaleString()}
              </span>
            )}
          </section>
        </>
      )}
    </div>
  )
}
