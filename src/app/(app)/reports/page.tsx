'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SummaryCards } from '@/components/reports/summary-cards'
import { SpendingBarChart } from '@/components/reports/spending-bar-chart'
import { CategoryPieChart } from '@/components/reports/category-pie-chart'
import { SpendingTrendChart } from '@/components/reports/spending-trend-chart'
import { TopTransactionsTable } from '@/components/reports/top-transactions-table'
import { SankeyChart } from '@/components/reports/sankey-chart'
import { SavingsRateChart } from '@/components/reports/savings-rate-chart'
import { MoMComparisonChart } from '@/components/reports/mom-comparison-chart'
import { getDatePreset } from '@/lib/date-presets'

interface ReportData {
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

export default function ReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setTimeout(() => setLoading(true), 0)
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    params.set('group_by', groupBy)

    fetch(`/api/reports?${params}`).then(r => r.json()).then(result => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [startDate, endDate, groupBy])

  const applyPreset = (preset: string) => {
    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else {
      const { start, end } = getDatePreset(preset)
      setStartDate(start)
      setEndDate(end)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Reports</h2>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-32 h-8 text-xs dark:[color-scheme:dark]" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-32 h-8 text-xs dark:[color-scheme:dark]" />
        </div>
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
        <div className="flex gap-1">
          {[
            { label: '1mo', value: '1mo' },
            { label: '3mo', value: '3mo' },
            { label: '6mo', value: '6mo' },
            { label: '1yr', value: '1yr' },
            { label: 'All', value: 'all' },
          ].map(p => (
            <Button key={p.value} variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => applyPreset(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>
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
