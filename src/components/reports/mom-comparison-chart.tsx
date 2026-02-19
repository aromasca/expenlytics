'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { useTheme } from '@/components/theme-provider'
import { formatCurrency } from '@/lib/format'
import { getChartColors } from '@/lib/chart-theme'

interface MoMComparisonChartProps {
  data: Array<{ group: string; current: number; previous: number; delta: number; percentChange: number }>
}

export function MoMComparisonChart({ data }: MoMComparisonChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const colors = getChartColors(isDark)

  const chartData = data.slice(0, 8)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Month-over-Month Change</h3>
      {chartData.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">Need at least 2 months of data</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36 + 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
            <XAxis type="number" fontSize={11} tickFormatter={(v) => formatCurrency(v)} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="group" fontSize={11} width={120} stroke={colors.text} tick={{ fill: colors.text }} axisLine={false} tickLine={false} />
            <ReferenceLine x={0} stroke={colors.grid} />
            <Tooltip
              formatter={(value: number | undefined) => [formatCurrency(Number(value)), 'Change']}
              contentStyle={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.grid}`, borderRadius: '6px', fontSize: '12px' }}
              itemStyle={{ color: colors.fg }}
              labelStyle={{ color: colors.fg }}
              cursor={false}
            />
            <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.delta <= 0 ? colors.green : colors.red} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
