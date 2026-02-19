'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'
import { getChartColors } from '@/lib/chart-theme'

interface SpendingBarChartProps {
  data: Array<{ period: string; amount: number }>
}

export function SpendingBarChart({ data }: SpendingBarChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const colors = getChartColors(isDark)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Spending Over Time</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), 'Spent']}
              contentStyle={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.grid}`, borderRadius: '6px', fontSize: '12px', color: colors.fg }}
              labelStyle={{ color: colors.fg }}
              itemStyle={{ color: colors.fg }}
              cursor={false}
            />
            <Bar dataKey="amount" fill={colors.fg} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
