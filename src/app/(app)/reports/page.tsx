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
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  switch (preset) {
    case 'thisMonth':
      return { start: `${yyyy}-${mm}-01`, end: today }
    case 'lastMonth': {
      const d = new Date(yyyy, now.getMonth() - 1, 1)
      const lastDay = new Date(yyyy, now.getMonth(), 0)
      return { start: d.toISOString().slice(0, 10), end: lastDay.toISOString().slice(0, 10) }
    }
    case 'thisQuarter': {
      const qStart = new Date(yyyy, Math.floor(now.getMonth() / 3) * 3, 1)
      return { start: qStart.toISOString().slice(0, 10), end: today }
    }
    case 'thisYear':
      return { start: `${yyyy}-01-01`, end: today }
    case 'last12Months': {
      const d = new Date(yyyy, now.getMonth() - 11, 1)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    default:
      return { start: '', end: '' }
  }
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [groupBy, setGroupBy] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-32 h-8 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-32 h-8 text-xs" />
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
            { label: 'This month', value: 'thisMonth' },
            { label: 'Last month', value: 'lastMonth' },
            { label: 'Q', value: 'thisQuarter' },
            { label: 'YTD', value: 'thisYear' },
            { label: '12mo', value: 'last12Months' },
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
        <>
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

          <SpendingTrendChart data={data.trend} />
          <TopTransactionsTable data={data.topTransactions} />
        </>
      ) : null}
    </div>
  )
}
