'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CommitmentTable } from '@/components/commitment-table'
import { CommitmentTrendChart } from '@/components/commitment-trend-chart'
import { CommitmentFilters } from '@/components/commitments/commitment-filters'
import { CommitmentActions } from '@/components/commitments/commitment-actions'
import { RefreshCw, ChevronDown, ChevronRight, RotateCcw, Ban } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { CommitmentGroup, CommitmentSortBy } from '@/types/commitments'
import { useCommitments, useCommitmentStatus, useCommitmentOverride, useNormalizeCommitments } from '@/hooks/use-commitments'

const FREQUENCY_RANK: Record<string, number> = {
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  'semi-annual': 4,
  yearly: 5,
  irregular: 6,
}

const DEFAULT_ORDERS: Record<CommitmentSortBy, 'asc' | 'desc'> = {
  merchantName: 'asc',
  frequency: 'asc',
  category: 'asc',
  avgAmount: 'desc',
  estimatedMonthlyAmount: 'desc',
  occurrences: 'desc',
  lastDate: 'desc',
}

function sortGroups<T extends CommitmentGroup>(groups: T[], sortBy: CommitmentSortBy, sortOrder: 'asc' | 'desc'): T[] {
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
  const [sortBy, setSortBy] = useState<CommitmentSortBy>('estimatedMonthlyAmount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [endedExpanded, setEndedExpanded] = useState(false)
  const [excludedExpanded, setExcludedExpanded] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [pendingRemovals, setPendingRemovals] = useState<Map<string, 'ended' | 'not_recurring'>>(new Map())

  const { data, isLoading: loading } = useCommitments(startDate, endDate)
  const commitmentStatus = useCommitmentStatus()
  const commitmentOverride = useCommitmentOverride()
  const normalizeCommitments = useNormalizeCommitments()

  const handleSort = (column: CommitmentSortBy) => {
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

  const handleStatusChange = (merchantName: string, status: 'ended' | 'not_recurring') => {
    if (!data) return
    const group = data.activeGroups.find(g => g.merchantName === merchantName)
    if (!group) return

    setPendingRemovals(prev => new Map(prev).set(merchantName, status))

    setSelectedMerchants(prev => {
      const next = new Set(prev)
      next.delete(merchantName)
      return next
    })

    commitmentStatus.mutate(
      { merchant: merchantName, status, statusDate: status === 'ended' ? group.lastDate : undefined },
      { onError: () => setPendingRemovals(prev => { const next = new Map(prev); next.delete(merchantName); return next }) }
    )
  }

  const handleUndoPending = (merchantName: string) => {
    setPendingRemovals(prev => {
      const next = new Map(prev)
      next.delete(merchantName)
      return next
    })
    commitmentStatus.mutate({ merchant: merchantName, status: 'active' })
  }

  const handleReactivate = (merchantName: string) => {
    commitmentStatus.mutate({ merchant: merchantName, status: 'active' })
  }

  const handleRestore = (merchantName: string) => {
    commitmentStatus.mutate({ merchant: merchantName, status: 'active' })
  }

  const handleOverrideChange = (merchant: string, frequencyOverride: string | null, monthlyAmountOverride: number | null) => {
    commitmentOverride.mutate({ merchant, frequencyOverride, monthlyAmountOverride })
  }

  const sortedActive = data ? sortGroups(data.activeGroups, sortBy, sortOrder) : []
  const categoryGroups = groupByCategory(sortedActive)
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
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => normalizeCommitments.mutate()} disabled={normalizeCommitments.isPending}>
          {normalizeCommitments.isPending ? 'Analyzing...' : 'Re-analyze'}
        </Button>
      </div>

      {/* Date range filters */}
      <CommitmentFilters
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
      />

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

          {/* Active commitments by category */}
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

          {/* Ended commitments section */}
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
                            commitmentStatus.mutate({ merchant: group.merchantName, status: 'not_recurring' })
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

          {/* Excluded merchants section */}
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

      {/* Bulk actions bar + merge dialog */}
      <CommitmentActions
        selectedMerchants={selectedMerchants}
        onClearSelection={() => setSelectedMerchants(new Set())}
        onBulkEnd={merchants => merchants.forEach(m => handleStatusChange(m, 'ended'))}
        onBulkExclude={merchants => merchants.forEach(m => handleStatusChange(m, 'not_recurring'))}
      />
    </div>
  )
}
