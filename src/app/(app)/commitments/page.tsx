'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CommitmentTable } from '@/components/commitment-table'
import { CommitmentTrendChart } from '@/components/commitment-trend-chart'
import { RefreshCw, ChevronDown, ChevronRight, RotateCcw, Merge, Ban, StopCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { getDatePreset } from '@/lib/date-presets'

type SortBy = 'merchantName' | 'frequency' | 'category' | 'avgAmount' | 'estimatedMonthlyAmount' | 'occurrences' | 'lastDate'

const FREQUENCY_RANK: Record<string, number> = {
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  'semi-annual': 4,
  yearly: 5,
  irregular: 6,
}

const DEFAULT_ORDERS: Record<SortBy, 'asc' | 'desc'> = {
  merchantName: 'asc',
  frequency: 'asc',
  category: 'asc',
  avgAmount: 'desc',
  estimatedMonthlyAmount: 'desc',
  occurrences: 'desc',
  lastDate: 'desc',
}

interface CommitmentGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
  unexpectedActivity?: boolean
  frequencyOverride?: string | null
  monthlyAmountOverride?: number | null
}

interface EndedCommitmentGroup extends CommitmentGroup {
  statusChangedAt: string
  unexpectedActivity: boolean
}

interface CommitmentData {
  activeGroups: CommitmentGroup[]
  endedGroups: EndedCommitmentGroup[]
  excludedMerchants: Array<{ merchant: string; excludedAt: string }>
  summary: {
    activeCount: number
    activeMonthly: number
    endedCount: number
    endedWasMonthly: number
    excludedCount: number
  }
  trendData: Array<{ month: string; amount: number }>
}

function sortGroups<T extends CommitmentGroup>(groups: T[], sortBy: SortBy, sortOrder: 'asc' | 'desc'): T[] {
  return [...groups].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'merchantName':
        cmp = a.merchantName.localeCompare(b.merchantName)
        break
      case 'frequency':
        cmp = (FREQUENCY_RANK[a.frequency] ?? 99) - (FREQUENCY_RANK[b.frequency] ?? 99)
        break
      case 'category':
        cmp = (a.category ?? '').localeCompare(b.category ?? '')
        break
      case 'avgAmount':
        cmp = a.avgAmount - b.avgAmount
        break
      case 'estimatedMonthlyAmount':
        cmp = a.estimatedMonthlyAmount - b.estimatedMonthlyAmount
        break
      case 'occurrences':
        cmp = a.occurrences - b.occurrences
        break
      case 'lastDate':
        cmp = a.lastDate.localeCompare(b.lastDate)
        break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
}

function computeTrendData(groups: Array<{ firstDate: string; lastDate: string; estimatedMonthlyAmount: number }>) {
  if (groups.length === 0) return []
  let minDate = groups[0].firstDate
  let maxDate = groups[0].lastDate
  for (const g of groups) {
    if (g.firstDate < minDate) minDate = g.firstDate
    if (g.lastDate > maxDate) maxDate = g.lastDate
  }
  const months: string[] = []
  const start = new Date(minDate.slice(0, 7) + '-01')
  const end = new Date(maxDate.slice(0, 7) + '-01')
  const cursor = new Date(start)
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months.map(month => {
    let amount = 0
    for (const g of groups) {
      if (month >= g.firstDate.slice(0, 7) && month <= g.lastDate.slice(0, 7)) {
        amount += g.estimatedMonthlyAmount
      }
    }
    return { month, amount: Math.round(amount * 100) / 100 }
  })
}

function groupByCategory(groups: CommitmentGroup[]): Map<string, CommitmentGroup[]> {
  const map = new Map<string, CommitmentGroup[]>()
  for (const g of groups) {
    const key = g.category ?? 'Other'
    const list = map.get(key) ?? []
    list.push(g)
    map.set(key, list)
  }
  return map
}

export default function CommitmentsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [data, setData] = useState<CommitmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [normalizing, setNormalizing] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('estimatedMonthlyAmount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [endedExpanded, setEndedExpanded] = useState(false)
  const [excludedExpanded, setExcludedExpanded] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [merging, setMerging] = useState(false)
  const [pendingRemovals, setPendingRemovals] = useState<Map<string, 'ended' | 'not_recurring'>>(new Map())

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(DEFAULT_ORDERS[column])
    }
  }

  const handleToggleExpand = (merchant: string) => {
    setExpandedMerchant(prev => prev === merchant ? null : merchant)
  }

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const fetchData = () => {
    setLoading(true)
    setPendingRemovals(new Map())
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)

    fetch(`/api/commitments?${params}`)
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

    fetch(`/api/commitments?${params}`)
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
    fetch('/api/commitments/normalize', {
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

  const handleStatusChange = (merchantName: string, status: 'ended' | 'not_recurring') => {
    if (!data) return
    const group = data.activeGroups.find(g => g.merchantName === merchantName)
    if (!group) return

    // Mark as pending — keep in list but faded so layout doesn't shift
    setPendingRemovals(prev => new Map(prev).set(merchantName, status))

    setSelectedMerchants(prev => {
      const next = new Set(prev)
      next.delete(merchantName)
      return next
    })

    fetch('/api/commitments/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName, status, statusDate: status === 'ended' ? group.lastDate : undefined }),
    }).catch(() => { fetchData() })
  }

  const handleUndoPending = (merchantName: string) => {
    setPendingRemovals(prev => {
      const next = new Map(prev)
      next.delete(merchantName)
      return next
    })
    // Revert on the server — set back to active
    fetch('/api/commitments/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName, status: 'active' }),
    }).catch(() => { fetchData() })
  }

  const handleReactivate = (merchantName: string) => {
    if (!data) return
    const group = data.endedGroups.find(g => g.merchantName === merchantName)
    if (!group) return
    const newEnded = data.endedGroups.filter(g => g.merchantName !== merchantName)
    const newActive = [...data.activeGroups, group]
    const activeMonthly = Math.round(newActive.reduce((s, g) => s + g.estimatedMonthlyAmount, 0) * 100) / 100
    setData(prev => prev ? {
      ...prev,
      activeGroups: newActive,
      endedGroups: newEnded,
      trendData: computeTrendData(newActive),
      summary: {
        ...prev.summary,
        activeCount: newActive.length,
        activeMonthly,
        endedCount: newEnded.length,
        endedWasMonthly: Math.round(newEnded.reduce((s, g) => s + g.estimatedMonthlyAmount, 0) * 100) / 100,
      },
    } : null)

    fetch('/api/commitments/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName, status: 'active' }),
    }).catch(() => { fetchData() })
  }

  const handleRestore = (merchantName: string) => {
    if (!data) return
    const newExcluded = data.excludedMerchants.filter(e => e.merchant !== merchantName)
    setData(prev => prev ? {
      ...prev,
      excludedMerchants: newExcluded,
      summary: {
        ...prev.summary,
        excludedCount: newExcluded.length,
      },
    } : null)

    fetch('/api/commitments/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchantName, status: 'active' }),
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
    fetch('/api/commitments/merge', {
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

  const handleOverrideChange = (merchant: string, frequencyOverride: string | null, monthlyAmountOverride: number | null) => {
    if (!data) return
    // Optimistic: update local state immediately
    setData(prev => {
      if (!prev) return prev
      const updateGroup = (g: CommitmentGroup) => {
        if (g.merchantName !== merchant) return g
        return {
          ...g,
          frequencyOverride,
          monthlyAmountOverride,
          ...(frequencyOverride ? { frequency: frequencyOverride as CommitmentGroup['frequency'] } : {}),
          ...(monthlyAmountOverride != null ? { estimatedMonthlyAmount: monthlyAmountOverride } : {}),
        }
      }
      return {
        ...prev,
        activeGroups: prev.activeGroups.map(updateGroup),
        endedGroups: prev.endedGroups.map(g => updateGroup(g) as typeof g),
      }
    })

    fetch('/api/commitments/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, frequencyOverride, monthlyAmountOverride }),
    })
      .then(r => r.json())
      .then(res => {
        if (res.estimatedMonthlyAmount != null) {
          setData(prev => {
            if (!prev) return prev
            return {
              ...prev,
              activeGroups: prev.activeGroups.map(g =>
                g.merchantName === merchant ? { ...g, estimatedMonthlyAmount: res.estimatedMonthlyAmount } : g
              ),
            }
          })
        }
      })
      .catch(() => { fetchData() })
  }

  const sortedActive = data ? sortGroups(data.activeGroups, sortBy, sortOrder) : []
  const categoryGroups = groupByCategory(sortedActive)
  // Compute effective counts excluding pending removals for summary/trend
  const effectiveActive = data ? data.activeGroups.filter(g => !pendingRemovals.has(g.merchantName)) : []
  const effectiveActiveMonthly = Math.round(effectiveActive.reduce((s, g) => s + g.estimatedMonthlyAmount, 0) * 100) / 100
  const effectiveTrendData = data && pendingRemovals.size > 0 ? computeTrendData(effectiveActive) : data?.trendData ?? []
  const pendingEndedCount = Array.from(pendingRemovals.values()).filter(s => s === 'ended').length
  const pendingExcludedCount = Array.from(pendingRemovals.values()).filter(s => s === 'not_recurring').length

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Commitments</h2>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleNormalize} disabled={normalizing}>
          {normalizing ? 'Analyzing...' : 'Re-analyze'}
        </Button>
      </div>

      {/* Date range filters */}
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
          {/* Trend chart */}
          <CommitmentTrendChart data={effectiveTrendData} />

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.activeCount - pendingRemovals.size}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(effectiveActiveMonthly)}/mo</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Ended</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.endedCount + pendingEndedCount}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(data.summary.endedWasMonthly)} was/mo</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Excluded</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{data.summary.excludedCount + pendingExcludedCount}</p>
            </Card>
          </div>

          {/* Active Subscriptions by category */}
          {Array.from(categoryGroups.entries()).map(([category, groups]) => {
            const isCollapsed = collapsedCategories.has(category)
            const activeInGroup = groups.filter(g => !pendingRemovals.has(g.merchantName))
            const subtotal = activeInGroup.reduce((sum, g) => sum + g.estimatedMonthlyAmount, 0)
            return (
              <div key={category} className="border rounded-lg">
                <button
                  className="flex items-center justify-between px-3 py-2 w-full text-left hover:bg-muted/50"
                  onClick={() => toggleCategory(category)}
                >
                  <span className="flex items-center gap-1.5">
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-xs font-medium">{category}</span>
                    <span className="text-[11px] text-muted-foreground">({groups.length})</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(subtotal)}/mo</span>
                </button>
                {!isCollapsed && (
                  <div className="px-0">
                    <CommitmentTable
                      groups={groups}
                      onStatusChange={handleStatusChange}
                      onOverrideChange={handleOverrideChange}
                      selectable
                      selectedMerchants={selectedMerchants}
                      onSelectionChange={setSelectedMerchants}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      expandedMerchant={expandedMerchant}
                      onToggleExpand={handleToggleExpand}
                      pendingRemovals={pendingRemovals}
                      onUndoPending={handleUndoPending}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {sortedActive.length === 0 && (
            <Card className="p-3">
              <p className="text-center text-muted-foreground py-6 text-xs">
                No active commitments detected.
              </p>
            </Card>
          )}

          {/* Ended Subscriptions section */}
          {data.endedGroups.length > 0 && (
            <div className="border rounded-lg">
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full text-left"
                onClick={() => setEndedExpanded(e => !e)}
              >
                {endedExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Ended ({data.endedGroups.length})
              </button>
              {endedExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {data.endedGroups.map(group => (
                    <div key={group.merchantName} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{group.merchantName}</span>
                        <span className="text-muted-foreground">
                          {group.occurrences}x &middot; {formatCurrency(group.estimatedMonthlyAmount)}/mo
                        </span>
                        {group.unexpectedActivity && (
                          <span className="text-amber-500 text-[11px] font-medium">Activity after end</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-muted-foreground"
                          onClick={() => handleReactivate(group.merchantName)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reactivate
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-muted-foreground"
                          onClick={() => {
                            fetch('/api/commitments/status', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ merchant: group.merchantName, status: 'not_recurring' }),
                            })
                              .then(() => fetchData())
                              .catch(() => fetchData())
                          }}
                          title="Exclude from commitments"
                        >
                          <Ban className="h-3 w-3 mr-1" />
                          Exclude
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Excluded Merchants section */}
          {data.excludedMerchants.length > 0 && (
            <div className="border rounded-lg">
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground w-full text-left"
                onClick={() => setExcludedExpanded(e => !e)}
              >
                {excludedExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Excluded ({data.excludedMerchants.length})
              </button>
              {excludedExpanded && (
                <div className="px-3 pb-2 space-y-1">
                  {data.excludedMerchants.map(item => (
                    <div key={item.merchant} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-muted/50">
                      <div>
                        <span className="font-medium">{item.merchant}</span>
                        <span className="text-muted-foreground ml-2">{item.excludedAt.slice(0, 10)}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => handleRestore(item.merchant)}
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

      {/* Sticky selection bar */}
      {selectedMerchants.size >= 1 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{selectedMerchants.size} selected</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => {
            for (const m of selectedMerchants) handleStatusChange(m, 'ended')
            setSelectedMerchants(new Set())
          }}>
            <StopCircle className="h-3.5 w-3.5 mr-1" />
            End
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => {
            for (const m of selectedMerchants) handleStatusChange(m, 'not_recurring')
            setSelectedMerchants(new Set())
          }}>
            <Ban className="h-3.5 w-3.5 mr-1" />
            Exclude
          </Button>
          {selectedMerchants.size >= 2 && (
            <Button size="sm" className="h-7 text-xs" onClick={openMergeDialog}>
              <Merge className="h-3.5 w-3.5 mr-1" />
              Merge
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedMerchants(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Merge Dialog */}
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
