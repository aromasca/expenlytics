'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MonthlyFlow } from '@/lib/insights/types'
import { formatCurrency } from '@/lib/format'

export function IncomeOutflowChart({ data }: { data: MonthlyFlow[] }) {
  if (data.length === 0) return null

  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  const textColor = isDark ? '#A1A1AA' : '#737373'
  const gridColor = isDark ? '#27272A' : '#E5E5E5'

  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <Tooltip
            cursor={false}
            contentStyle={{
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: gridColor,
              fontSize: 12,
            }}
            labelStyle={{ color: textColor }}
            itemStyle={{ color: textColor }}
            formatter={(value: number | undefined) => [formatCurrency(Number(value)), '']}
          />
          <Bar dataKey="income" fill="#10B981" radius={[2, 2, 0, 0]} name="Income" />
          <Bar dataKey="spending" fill={isDark ? '#FAFAFA' : '#0A0A0A'} radius={[2, 2, 0, 0]} name="Spending" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
