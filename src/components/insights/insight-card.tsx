'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import type { InsightCard as InsightCardType } from '@/lib/insights/types'

const severityColors: Record<string, { border: string; bg: string; text: string }> = {
  concerning: { border: '#EF4444', bg: '#FEF2F2', text: '#991B1B' },
  notable: { border: '#F59E0B', bg: '#FFFBEB', text: '#92400E' },
  favorable: { border: '#22C55E', bg: '#F0FDF4', text: '#166534' },
  informational: { border: '#3B82F6', bg: '#EFF6FF', text: '#1E40AF' },
}

const severityColorsDark: Record<string, { border: string; bg: string; text: string }> = {
  concerning: { border: '#F87171', bg: '#451A1A', text: '#FCA5A5' },
  notable: { border: '#FBBF24', bg: '#452A1A', text: '#FDE68A' },
  favorable: { border: '#4ADE80', bg: '#1A3A2A', text: '#86EFAC' },
  informational: { border: '#60A5FA', bg: '#1A2A45', text: '#93C5FD' },
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
  const textColor = isDark ? '#FAF5F2' : '#3D2520'
  const gridColor = isDark ? '#594D49' : '#F4E5E0'
  const cardBg = isDark ? '#3A2A26' : '#FFFFFF'

  return (
    <Card
      className="cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden"
      style={{ borderLeft: `4px solid ${colors.border}` }}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight" style={{ color: colors.text }}>
              {insight.headline}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{insight.metric}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {insight.sparkline.length > 1 && (
              <div className="w-24 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={insight.sparkline}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={chartColor}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
            {/* Explanation */}
            {insight.detail?.explanation && (
              <p className="text-sm leading-relaxed">{insight.detail.explanation}</p>
            )}

            {/* Comparison chart */}
            {insight.detail && insight.detail.breakdown.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">{insight.detail.periodLabel}</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insight.detail.breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="label" fontSize={11} stroke={textColor} tick={{ fill: textColor }} />
                      <YAxis fontSize={11} tickFormatter={(v) => `$${v}`} stroke={textColor} tick={{ fill: textColor }} />
                      <Tooltip
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                        cursor={false}
                        contentStyle={{
                          backgroundColor: cardBg,
                          border: `1px solid ${gridColor}`,
                          borderRadius: '8px',
                          color: textColor,
                        }}
                        labelStyle={{ color: textColor }}
                        itemStyle={{ color: textColor }}
                      />
                      <Bar dataKey="previous" fill={isDark ? '#594D49' : '#F4E5E0'} name="Previous" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="current" fill={chartColor} name="Current" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Transaction list */}
            {insight.detail?.transactions && insight.detail.transactions.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Related Transactions
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Date</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Description</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Category</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insight.detail.transactions.map((txn, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">{txn.date}</td>
                          <td className="py-2 px-3 text-xs truncate max-w-[200px]">{txn.description}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">{txn.category ?? '—'}</td>
                          <td className="py-2 px-3 text-xs text-right font-medium">${txn.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Fallback sparkline chart when no detail */}
            {!insight.detail && insight.sparkline.length > 1 && (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insight.sparkline}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="label" fontSize={11} stroke={textColor} tick={{ fill: textColor }} />
                    <YAxis fontSize={11} tickFormatter={(v) => `$${v}`} stroke={textColor} tick={{ fill: textColor }} />
                    <Tooltip
                      formatter={(value) => `$${Number(value).toFixed(2)}`}
                      cursor={false}
                      contentStyle={{
                        backgroundColor: cardBg,
                        border: `1px solid ${gridColor}`,
                        borderRadius: '8px',
                        color: textColor,
                      }}
                      labelStyle={{ color: textColor }}
                      itemStyle={{ color: textColor }}
                    />
                    <Bar dataKey="value" fill={chartColor} name="Amount" radius={[4, 4, 0, 0]} />
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
