'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'

interface SpendingTrendChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const fgColor = isDark ? '#FAFAFA' : '#0A0A0A'

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Spending Trend</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="period" fontSize={11} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={textColor} tick={{ fill: textColor }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px', color: fgColor }}
              labelStyle={{ color: fgColor }}
              itemStyle={{ color: fgColor }}
            />
            <Legend wrapperStyle={{ color: textColor, fontSize: '12px' }} />
            <Line type="monotone" dataKey="debits" stroke={fgColor} name="Spending" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="credits" stroke={isDark ? '#34D399' : '#10B981'} name="Income" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
