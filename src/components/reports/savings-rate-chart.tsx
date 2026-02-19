'use client'

import { Card } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { getChartColors } from '@/lib/chart-theme'

interface SavingsRateChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SavingsRateChart({ data }: SavingsRateChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const colors = getChartColors(isDark)

  const chartData = data.map(d => ({
    period: d.period,
    rate: d.credits > 0 ? Math.round(((d.credits - d.debits) / d.credits) * 1000) / 10 : 0,
  }))

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Savings Rate</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.green} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke={colors.grid} strokeDasharray="3 3" />
            <Tooltip
              formatter={(value: number | undefined) => [`${Number(value).toFixed(1)}%`, 'Savings Rate']}
              contentStyle={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.grid}`, borderRadius: '6px', fontSize: '12px' }}
              itemStyle={{ color: colors.fg }}
              labelStyle={{ color: colors.fg }}
              cursor={false}
            />
            <Area
              type="monotone"
              dataKey="rate"
              stroke={colors.green}
              fill="url(#savingsGradient)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
