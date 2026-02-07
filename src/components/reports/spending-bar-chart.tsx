'use client'

import { Card } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SpendingBarChartProps {
  data: Array<{ period: string; amount: number }>
}

export function SpendingBarChart({ data }: SpendingBarChartProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Spending Over Time</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" fontSize={12} />
            <YAxis fontSize={12} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Spent']} />
            <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
