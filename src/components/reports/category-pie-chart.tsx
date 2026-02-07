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

  // Theme-aware colors with explicit values for better Recharts compatibility
  const textColor = isDark ? '#FAF5F2' : '#3D2520'
  const gridColor = isDark ? '#594D49' : '#F4E5E0'
  const cardBg = isDark ? '#3A2A26' : '#FFFFFF'

  // Show top 8 + group rest as "Other"
  const top8 = data.slice(0, 8)
  const rest = data.slice(8)
  const chartData = rest.length > 0
    ? [...top8, { category: 'Other', color: '#9CA3AF', amount: rest.reduce((s, r) => s + r.amount, 0), percentage: rest.reduce((s, r) => s + r.percentage, 0) }]
    : top8

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Category Breakdown</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              label={{
                fill: textColor,
                fontSize: 12
              }}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `$${Number(value).toFixed(2)}`}
              contentStyle={{
                backgroundColor: cardBg,
                border: `1px solid ${gridColor}`,
                borderRadius: '8px',
                color: textColor
              }}
            />
            <Legend
              wrapperStyle={{
                color: textColor
              }}
              iconType="circle"
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
