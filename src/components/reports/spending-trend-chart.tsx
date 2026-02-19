'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'
import { getChartColors } from '@/lib/chart-theme'

interface SpendingTrendChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const colors = getChartColors(isDark)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Spending Trend</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.grid}`, borderRadius: '6px', fontSize: '12px', color: colors.fg }}
              labelStyle={{ color: colors.fg }}
              itemStyle={{ color: colors.fg }}
            />
            <Legend wrapperStyle={{ color: colors.text, fontSize: '12px' }} />
            <Line type="monotone" dataKey="debits" stroke={colors.fg} name="Spending" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="credits" stroke={colors.green} name="Income" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
