'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '@/components/theme-provider'

interface SpendingBarChartProps {
  data: Array<{ period: string; amount: number }>
}

export function SpendingBarChart({ data }: SpendingBarChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Theme-aware colors with explicit values for better Recharts compatibility
  const textColor = isDark ? '#FAF5F2' : '#3D2520'
  const gridColor = isDark ? '#594D49' : '#F4E5E0'
  const cardBg = isDark ? '#3A2A26' : '#FFFFFF'

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Spending Over Time</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
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
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Spent']}
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
              cursor={false}
            />
            <Bar
              dataKey="amount"
              fill="var(--chart-1)"
              radius={[4, 4, 0, 0]}
              activeBar={{ fill: 'var(--primary)', opacity: 0.8 }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
