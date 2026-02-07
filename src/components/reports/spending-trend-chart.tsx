'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTheme } from '@/components/theme-provider'

interface SpendingTrendChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Theme-aware colors with explicit values for better Recharts compatibility
  const textColor = isDark ? '#FAF5F2' : '#3D2520'
  const gridColor = isDark ? '#594D49' : '#F4E5E0'
  const cardBg = isDark ? '#3A2A26' : '#FFFFFF'

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Spending Trend</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="period"
              fontSize={12}
              stroke={textColor}
              tick={{ fill: textColor }}
              axisLine={{ stroke: textColor }}
            />
            <YAxis
              fontSize={12}
              tickFormatter={(v) => `$${v}`}
              stroke={textColor}
              tick={{ fill: textColor }}
              axisLine={{ stroke: textColor }}
            />
            <Tooltip
              formatter={(value) => `$${Number(value).toFixed(2)}`}
              contentStyle={{
                backgroundColor: cardBg,
                border: `1px solid ${gridColor}`,
                borderRadius: '8px',
                color: textColor
              }}
              labelStyle={{
                color: textColor
              }}
              itemStyle={{
                color: textColor
              }}
            />
            <Legend
              wrapperStyle={{
                color: textColor
              }}
            />
            <Line type="monotone" dataKey="debits" stroke="var(--chart-1)" name="Spending" strokeWidth={2} />
            <Line type="monotone" dataKey="credits" stroke="var(--chart-2)" name="Income" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
