'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePicker } from '@/components/shared/date-range-picker'
import { SummaryCards } from '@/components/reports/summary-cards'
import { SpendingBarChart } from '@/components/reports/spending-bar-chart'
import { CategoryPieChart } from '@/components/reports/category-pie-chart'
import { SpendingTrendChart } from '@/components/reports/spending-trend-chart'
import { TopTransactionsTable } from '@/components/reports/top-transactions-table'
import { SankeyChart } from '@/components/reports/sankey-chart'
import { SavingsRateChart } from '@/components/reports/savings-rate-chart'
import { MoMComparisonChart } from '@/components/reports/mom-comparison-chart'
import { useReports } from '@/hooks/use-reports'

export default function ReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month')

  const { data, isLoading: loading } = useReports(startDate, endDate, groupBy)

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Reports</h2>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
        />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'month' | 'quarter' | 'year')}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="quarter">Quarterly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : data ? (
        <div data-walkthrough="reports" className="space-y-4">
          <SummaryCards
            totalSpent={data.summary.totalSpent}
            totalIncome={data.summary.totalIncome}
            avgMonthly={data.summary.avgMonthly}
            topCategory={data.summary.topCategory}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SpendingBarChart data={data.spendingOverTime} />
            <CategoryPieChart data={data.categoryBreakdown} />
          </div>

          <SankeyChart data={data.sankeyData} incomeData={data.sankeyIncomeData} totalIncome={data.summary.totalIncome} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SpendingTrendChart data={data.trend} />
            <SavingsRateChart data={data.trend} />
          </div>

          <MoMComparisonChart data={data.momComparison} />
          <TopTransactionsTable data={data.topTransactions} />
        </div>
      ) : null}
    </div>
  )
}
