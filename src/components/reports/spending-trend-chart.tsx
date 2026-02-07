'use client'

import { Card } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SpendingTrendChartProps {
  data: Array<{ period: string; debits: number; credits: number }>
}

export function SpendingTrendChart({ data }: SpendingTrendChartProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Spending Trend</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
            <Legend />
            <Line type="monotone" dataKey="debits" stroke="hsl(var(--chart-1))" name="Spending" strokeWidth={2} />
            <Line type="monotone" dataKey="credits" stroke="hsl(var(--chart-2))" name="Income" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
