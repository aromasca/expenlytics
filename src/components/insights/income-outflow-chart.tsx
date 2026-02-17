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
          <defs>
            <linearGradient id="income-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#10B981" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="spending-grad-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A0A0A" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#0A0A0A" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="spending-grad-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FAFAFA" stopOpacity={0.85} />
              <stop offset="100%" stopColor="#FAFAFA" stopOpacity={0.6} />
            </linearGradient>
          </defs>
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
              borderRadius: 8,
              boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)',
            }}
            labelStyle={{ color: textColor }}
            itemStyle={{ color: textColor }}
            formatter={(value: number | undefined) => [formatCurrency(Number(value)), '']}
          />
          <Bar dataKey="income" fill="url(#income-grad)" radius={[3, 3, 0, 0]} name="Income" />
          <Bar dataKey="spending" fill={isDark ? 'url(#spending-grad-dark)' : 'url(#spending-grad-light)'} radius={[3, 3, 0, 0]} name="Spending" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
