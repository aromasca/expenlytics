export interface ReportData {
  summary: {
    totalSpent: number
    totalIncome: number
    avgMonthly: number
    topCategory: { name: string; amount: number }
  }
  spendingOverTime: Array<{ period: string; amount: number }>
  categoryBreakdown: Array<{ category: string; color: string; amount: number; percentage: number }>
  trend: Array<{ period: string; debits: number; credits: number }>
  topTransactions: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
  sankeyData: Array<{ category: string; category_group: string; color: string; amount: number }>
  sankeyIncomeData: Array<{ category: string; category_group: string; color: string; amount: number }>
  momComparison: Array<{ group: string; current: number; previous: number; delta: number; percentChange: number }>
}
