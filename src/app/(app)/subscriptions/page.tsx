'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RecurringChargesTable } from '@/components/recurring-charges-table'
import { RefreshCw, DollarSign, TrendingUp } from 'lucide-react'

interface RecurringGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
}

interface RecurringData {
  groups: RecurringGroup[]
  summary: {
    totalSubscriptions: number
    totalMonthly: number
    totalYearly: number
  }
}

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case 'last12Months': {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      return { start: fmt(start), end: fmt(now) }
    }
    case 'thisYear':
      return { start: `${now.getFullYear()}-01-01`, end: fmt(now) }
    case 'all':
    default:
      return { start: '', end: '' }
  }
}

export default function SubscriptionsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [data, setData] = useState<RecurringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)

  const fetchData = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/recurring?${params}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/recurring?${params}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [startDate, endDate])

  const applyPreset = (preset: string) => {
    const { start, end } = getDatePreset(preset)
    setStartDate(start)
    setEndDate(end)
  }

  const handleNormalize = () => {
    setNormalizing(true)
    fetch('/api/recurring/normalize', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        setNormalizing(false)
        fetchData()
      })
      .catch(() => { setNormalizing(false) })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Subscriptions & Recurring</h2>
          <p className="text-gray-500 text-sm mt-1">
            Automatically detected recurring charges from your statements
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleNormalize} disabled={normalizing}>
          {normalizing ? 'Analyzing...' : 'Re-analyze Merchants'}
        </Button>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">From</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">To</label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => applyPreset('last12Months')}>Last 12mo</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset('thisYear')}>This year</Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset('all')}>All time</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-50 p-2">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Recurring Charges</p>
                  <p className="text-2xl font-bold">{data.summary.totalSubscriptions}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-50 p-2">
                  <DollarSign className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Est. Monthly Cost</p>
                  <p className="text-2xl font-bold">${data.summary.totalMonthly.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-50 p-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Est. Yearly Cost</p>
                  <p className="text-2xl font-bold">${data.summary.totalYearly.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          </div>

          <RecurringChargesTable groups={data.groups} />
        </>
      ) : null}
    </div>
  )
}
