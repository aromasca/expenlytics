'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RecurringChargesTable } from '@/components/recurring-charges-table'
import { RefreshCw, ChevronDown, ChevronRight, RotateCcw, Merge } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { getDatePreset } from '@/lib/date-presets'

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
  dismissedGroups: RecurringGroup[]
  summary: {
    totalSubscriptions: number
    totalMonthly: number
    totalYearly: number
  }
}

export default function SubscriptionsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [data, setData] = useState<RecurringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)
  const [dismissedExpanded, setDismissedExpanded] = useState(false)
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [merging, setMerging] = useState(false)

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
    setTimeout(() => setLoading(true), 0)

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
    fetch('/api/recurring/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
      .then(r => r.json())
      .then(() => {
        setNormalizing(false)
        fetchData()
      })
      .catch(() => { setNormalizing(false) })
  }

  const handleDismiss = (merchantName: string) => {
    if (!data) return
    const group = data.groups.find(g => g.merchantName === merchantName)
    if (!group) return
    const newGroups = data.groups.filter(g => g.merchantName !== merchantName)
    const newDismissed = [...data.dismissedGroups, group]
    const totalMonthly = newGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
    setData({
      groups: newGroups,
      dismissedGroups: newDismissed,
      summary: {
        totalSubscriptions: newGroups.length,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
      },
    })
    setSelectedMerchants(prev => {
      const next = new Set(prev)
      next.delete(merchantName)
      return next
    })

    fetch('/api/recurring/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName }),
    }).catch(() => { fetchData() })
  }

  const handleRestore = (merchantName: string) => {
    if (!data) return
    const group = data.dismissedGroups.find(g => g.merchantName === merchantName)
    if (!group) return
    const newDismissed = data.dismissedGroups.filter(g => g.merchantName !== merchantName)
    const newGroups = [...data.groups, group]
    const totalMonthly = newGroups.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
    setData({
      groups: newGroups,
      dismissedGroups: newDismissed,
      summary: {
        totalSubscriptions: newGroups.length,
        totalMonthly: Math.round(totalMonthly * 100) / 100,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
      },
    })

    fetch('/api/recurring/dismiss', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName }),
    }).catch(() => { fetchData() })
  }

  const openMergeDialog = () => {
    const merchants = Array.from(selectedMerchants)
    setMergeTarget(merchants[0])
    setCustomTarget('')
    setMergeDialogOpen(true)
  }

  const handleMerge = () => {
    const target = mergeTarget === '__custom__' ? customTarget.trim() : mergeTarget
    if (!target) return
    setMerging(true)
    fetch('/api/recurring/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchants: Array.from(selectedMerchants), target }),
    })
      .then(r => r.json())
      .then(() => {
        setMerging(false)
        setMergeDialogOpen(false)
        setSelectedMerchants(new Set())
        fetchData()
      })
      .catch(() => { setMerging(false) })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recurring</h2>
        <div className="flex items-center gap-2">
          {selectedMerchants.size >= 2 && (
            <Button size="sm" className="h-7 text-xs" onClick={openMergeDialog}>
              <Merge className="h-3.5 w-3.5 mr-1" />
              Merge {selectedMerchants.size}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleNormalize} disabled={normalizing}>
            {normalizing ? 'Analyzing...' : 'Re-analyze'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-32 h-8 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-32 h-8 text-xs" />
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => applyPreset('last12Months')}>12mo</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => applyPreset('thisYear')}>YTD</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => applyPreset('all')}>All</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Recurring</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.totalSubscriptions}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Monthly</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{formatCurrency(data.summary.totalMonthly)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Yearly</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{formatCurrency(data.summary.totalYearly)}</p>
            </Card>
          </div>

          <RecurringChargesTable
            groups={data.groups}
            onDismiss={handleDismiss}
            selectable
            selectedMerchants={selectedMerchants}
            onSelectionChange={setSelectedMerchants}
          />

          {data.dismissedGroups.length > 0 && (
            <div className="border rounded-lg">
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full text-left"
                onClick={() => setDismissedExpanded(e => !e)}
              >
                {dismissedExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Dismissed ({data.dismissedGroups.length})
              </button>
              {dismissedExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {data.dismissedGroups.map(group => (
                    <div key={group.merchantName} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-muted/50">
                      <div>
                        <span className="font-medium">{group.merchantName}</span>
                        <span className="text-muted-foreground ml-2">
                          {group.occurrences}x &middot; {formatCurrency(group.estimatedMonthlyAmount)}/mo
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => handleRestore(group.merchantName)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Merchants</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Choose which merchant name to keep.
          </p>
          <div className="space-y-1">
            {Array.from(selectedMerchants).map(name => (
              <label key={name} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
                <input type="radio" name="mergeTarget" value={name} checked={mergeTarget === name} onChange={() => setMergeTarget(name)} />
                {name}
              </label>
            ))}
            <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
              <input type="radio" name="mergeTarget" value="__custom__" checked={mergeTarget === '__custom__'} onChange={() => setMergeTarget('__custom__')} />
              Custom name
            </label>
            {mergeTarget === '__custom__' && (
              <Input value={customTarget} onChange={e => setCustomTarget(e.target.value)} placeholder="Merchant name" className="ml-6 h-8 text-sm" autoFocus />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleMerge} disabled={merging || (mergeTarget === '__custom__' && !customTarget.trim())}>
              {merging ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
