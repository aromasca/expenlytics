'use client'

import { Card } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrency } from '@/lib/format'
import { useTheme } from '@/components/theme-provider'

interface TrendDataPoint {
  month: string
  amount: number
}

interface CommitmentTrendChartProps {
  data: TrendDataPoint[]
}

function CustomTooltip({ active, payload, label, isDark }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; isDark: boolean }) {
  if (!active || !payload?.length) return null
  const [y, m] = String(label).split('-')
  const date = new Date(Number(y), Number(m) - 1)
  const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-md"
      style={{
        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
        borderColor: isDark ? '#3F3F46' : '#E5E5E5',
      }}
    >
      <p className="text-[11px] text-muted-foreground mb-0.5">{monthLabel}</p>
      <p className="text-sm font-semibold tabular-nums" style={{ color: isDark ? '#FAFAFA' : '#0A0A0A' }}>
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  )
}

export function CommitmentTrendChart({ data }: CommitmentTrendChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const strokeColor = isDark ? '#A1A1AA' : '#525252'
  const fillColor = isDark ? 'rgba(161,161,170,0.1)' : 'rgba(82,82,82,0.08)'
  const dotFill = isDark ? '#18181B' : '#FFFFFF'

  if (data.length === 0) return null

  const amounts = data.map(d => d.amount)
  const current = amounts[amounts.length - 1]
  const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const prevMonth = amounts.length >= 2 ? amounts[amounts.length - 2] : current
  const change = current - prevMonth
  const changePct = prevMonth > 0 ? (change / prevMonth) * 100 : 0

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Commitment Spend</h3>
          <p className="text-2xl font-semibold tabular-nums mt-0.5">{formatCurrency(current)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
        </div>
        <div className="text-right">
          {change !== 0 && (
            <p className={`text-xs font-medium tabular-nums ${change > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {change > 0 ? '+' : ''}{formatCurrency(change)} ({change > 0 ? '+' : ''}{changePct.toFixed(1)}%)
            </p>
          )}
          <div className="flex gap-3 mt-1">
            <span className="text-[11px] text-muted-foreground tabular-nums">Avg {formatCurrency(avg)}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">Low {formatCurrency(min)}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">High {formatCurrency(max)}</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="commitmentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: textColor }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => {
              const [y, m] = v.split('-')
              return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} '${y.slice(2)}`
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: textColor }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCurrency(v)}
            width={60}
          />
          <ReferenceLine
            y={avg}
            stroke={textColor}
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          <Tooltip
            content={<CustomTooltip isDark={isDark} />}
            cursor={{ stroke: textColor, strokeDasharray: '3 3', strokeOpacity: 0.4 }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={strokeColor}
            fill="url(#commitmentGradient)"
            strokeWidth={2}
            dot={{ r: 3, fill: dotFill, stroke: strokeColor, strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: strokeColor, stroke: dotFill, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
