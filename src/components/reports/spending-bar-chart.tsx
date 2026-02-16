'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'

interface SpendingBarChartProps {
  data: Array<{ period: string; amount: number }>
}

export function SpendingBarChart({ data }: SpendingBarChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const barColor = isDark ? '#FAFAFA' : '#0A0A0A'

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Spending Over Time</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), 'Spent']}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px', color: isDark ? '#FAFAFA' : '#0A0A0A' }}
              labelStyle={{ color: isDark ? '#FAFAFA' : '#0A0A0A' }}
              itemStyle={{ color: isDark ? '#FAFAFA' : '#0A0A0A' }}
              cursor={false}
            />
            <Bar dataKey="amount" fill={barColor} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
