'use client'

import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useTheme } from '@/components/theme-provider'

interface CategoryPieChartProps {
  data: Array<{ category: string; color: string; amount: number; percentage: number }>
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'
  const cardBg = isDark ? '#111113' : '#FFFFFF'
  const fgColor = isDark ? '#FAFAFA' : '#0A0A0A'

  const top8 = data.slice(0, 8)
  const rest = data.slice(8)
  const chartData = rest.length > 0
    ? [...top8, { category: 'Other', color: '#71717A', amount: rest.reduce((s, r) => s + r.amount, 0), percentage: rest.reduce((s, r) => s + r.percentage, 0) }]
    : top8

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Category Breakdown</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              label={{ fill: fgColor, fontSize: 11 }}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `$${Number(value).toFixed(2)}`}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px', color: fgColor }}
            />
            <Legend wrapperStyle={{ color: textColor, fontSize: '11px' }} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
