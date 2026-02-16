'use client'

import { Card } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, type PieLabelRenderProps } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'

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

  // Aggregate small categories into "Other", merging with existing "Other" if present
  const top8 = data.slice(0, 8)
  const rest = data.slice(8)
  let chartData = [...top8]
  if (rest.length > 0) {
    const restAmount = rest.reduce((s, r) => s + r.amount, 0)
    const restPercentage = rest.reduce((s, r) => s + r.percentage, 0)
    const existingOtherIdx = chartData.findIndex(d => d.category === 'Other')
    if (existingOtherIdx >= 0) {
      chartData[existingOtherIdx] = {
        ...chartData[existingOtherIdx],
        amount: chartData[existingOtherIdx].amount + restAmount,
        percentage: chartData[existingOtherIdx].percentage + restPercentage,
      }
    } else {
      chartData.push({ category: 'Other', color: '#71717A', amount: restAmount, percentage: restPercentage })
    }
  }

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Category Breakdown</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
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
              label={({ percent, x, y, textAnchor }: PieLabelRenderProps & { x: number; y: number; textAnchor: string }) => {
                const pct = (percent ?? 0) * 100
                if (pct <= 5) return <text />
                return (
                  <text x={x} y={y} textAnchor={textAnchor} fill={fgColor} fontSize={11}>
                    {pct.toFixed(0)}%
                  </text>
                )
              }}
              labelLine={false}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{ backgroundColor: cardBg, border: `1px solid ${gridColor}`, borderRadius: '6px', fontSize: '12px' }}
              itemStyle={{ color: fgColor }}
              labelStyle={{ color: fgColor }}
              cursor={false}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ color: textColor, fontSize: '11px', paddingTop: '8px' }}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
