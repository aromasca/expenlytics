import { Card } from '@/components/ui/card'
import { DollarSign, TrendingUp, ArrowDownCircle, Tag } from 'lucide-react'

interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  avgMonthly: number
  topCategory: { name: string; amount: number }
}

export function SummaryCards({ totalSpent, totalIncome, avgMonthly, topCategory }: SummaryCardsProps) {
  const cards = [
    { label: 'Total Spent', value: `$${totalSpent.toFixed(2)}`, icon: ArrowDownCircle, color: 'text-red-500' },
    { label: 'Total Income', value: `$${totalIncome.toFixed(2)}`, icon: DollarSign, color: 'text-green-500' },
    { label: 'Avg Monthly Spend', value: `$${avgMonthly.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Top Category', value: topCategory.name, sub: `$${topCategory.amount.toFixed(2)}`, icon: Tag, color: 'text-purple-500' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(c => (
        <Card key={c.label} className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <c.icon className={`h-4 w-4 ${c.color}`} />
            <span className="text-xs text-gray-500 font-medium">{c.label}</span>
          </div>
          <p className="text-xl font-bold">{c.value}</p>
          {c.sub && <p className="text-sm text-gray-500">{c.sub}</p>}
        </Card>
      ))}
    </div>
  )
}
