import { Card } from '@/components/ui/card'

interface SummaryCardsProps {
  totalSpent: number
  totalIncome: number
  avgMonthly: number
  topCategory: { name: string; amount: number }
}

export function SummaryCards({ totalSpent, totalIncome, avgMonthly, topCategory }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">Total Spent</p>
        <p className="text-xl font-semibold tabular-nums mt-0.5">${totalSpent.toFixed(2)}</p>
      </Card>
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">Total Income</p>
        <p className="text-xl font-semibold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">${totalIncome.toFixed(2)}</p>
      </Card>
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">Avg Monthly</p>
        <p className="text-xl font-semibold tabular-nums mt-0.5">${avgMonthly.toFixed(2)}</p>
      </Card>
      <Card className="p-3">
        <p className="text-xs text-muted-foreground">Top Category</p>
        <p className="text-sm font-semibold mt-0.5 truncate">{topCategory.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">${topCategory.amount.toFixed(2)}</p>
      </Card>
    </div>
  )
}
