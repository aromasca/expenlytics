'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import type { InsightCard as InsightCardType } from '@/lib/insights/types'

const severityColors: Record<string, { border: string; text: string }> = {
  concerning: { border: '#DC2626', text: '#DC2626' },
  notable: { border: '#D97706', text: '#D97706' },
  favorable: { border: '#059669', text: '#059669' },
  informational: { border: '#737373', text: '#737373' },
}

const severityColorsDark: Record<string, { border: string; text: string }> = {
  concerning: { border: '#EF4444', text: '#FCA5A5' },
  notable: { border: '#F59E0B', text: '#FDE68A' },
  favorable: { border: '#10B981', text: '#6EE7B7' },
  informational: { border: '#A1A1AA', text: '#A1A1AA' },
}

interface InsightCardProps {
  insight: InsightCardType
  expanded: boolean
  onToggle: () => void
}

export function InsightCardComponent({ insight, expanded, onToggle }: InsightCardProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const colors = isDark ? severityColorsDark[insight.severity] : severityColors[insight.severity]
  const chartColor = colors.border

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const fgColor = isDark ? '#FAFAFA' : '#0A0A0A'

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30 overflow-hidden"
      style={{ borderLeft: `3px solid ${colors.border}` }}
      onClick={onToggle}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium leading-tight" style={{ color: colors.text }}>
              {insight.headline}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{insight.metric}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {insight.sparkline.length > 1 && (
              <div className="w-20 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={insight.sparkline}>
                    <Line type="monotone" dataKey="value" stroke={chartColor} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3" onClick={(e) => e.stopPropagation()}>
            {insight.detail?.explanation && (
              <p className="text-xs leading-relaxed text-muted-foreground">{insight.detail.explanation}</p>
            )}

            {insight.detail && insight.detail.breakdown.length > 0 && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">{insight.detail.periodLabel}</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insight.detail.breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" fontSize={10} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} tickFormatter={(v) => `$${v}`} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                        cursor={false}
                        contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '11px', color: fgColor }}
                        labelStyle={{ color: fgColor }}
                        itemStyle={{ color: fgColor }}
                      />
                      <Bar dataKey="previous" fill={isDark ? '#27272A' : '#E5E5E5'} name="Previous" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="current" fill={chartColor} name="Current" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {insight.detail?.transactions && insight.detail.transactions.length > 0 && (
              <div>
                <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Related Transactions
                </h4>
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-1 px-2 font-medium text-muted-foreground text-[11px]">Date</th>
                        <th className="text-left py-1 px-2 font-medium text-muted-foreground text-[11px]">Description</th>
                        <th className="text-left py-1 px-2 font-medium text-muted-foreground text-[11px]">Category</th>
                        <th className="text-right py-1 px-2 font-medium text-muted-foreground text-[11px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insight.detail.transactions.map((txn, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-1 px-2 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{txn.date}</td>
                          <td className="py-1 px-2 text-[11px] truncate max-w-[180px]">{txn.description}</td>
                          <td className="py-1 px-2 text-[11px] text-muted-foreground">{txn.category ?? '—'}</td>
                          <td className="py-1 px-2 text-[11px] text-right tabular-nums font-medium">${txn.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!insight.detail && insight.sparkline.length > 1 && (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insight.sparkline}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="label" fontSize={10} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} tickFormatter={(v) => `$${v}`} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => `$${Number(value).toFixed(2)}`}
                      cursor={false}
                      contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '11px', color: fgColor }}
                      labelStyle={{ color: fgColor }}
                      itemStyle={{ color: fgColor }}
                    />
                    <Bar dataKey="value" fill={chartColor} name="Amount" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
