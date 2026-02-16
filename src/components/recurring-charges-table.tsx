'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronRight, ChevronDown, StopCircle, Ban, AlertTriangle, ArrowUp, ArrowDown, Undo2 } from 'lucide-react'
import { formatCurrencyPrecise } from '@/lib/format'
import { RecurringRowDetail } from '@/components/recurring-row-detail'

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
  unexpectedActivity?: boolean
}

type SortBy = 'merchantName' | 'frequency' | 'category' | 'avgAmount' | 'estimatedMonthlyAmount' | 'occurrences' | 'lastDate'

interface RecurringChargesTableProps {
  groups: RecurringGroup[]
  onStatusChange?: (merchantName: string, status: 'ended' | 'not_recurring') => void
  selectable?: boolean
  selectedMerchants?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
  sortBy?: SortBy
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: SortBy) => void
  expandedMerchant?: string | null
  onToggleExpand?: (merchant: string) => void
  pendingRemovals?: Map<string, string>
  onUndoPending?: (merchantName: string) => void
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': '2x/yr',
  yearly: 'Yearly',
  irregular: 'Irregular',
}

const PAGE_SIZE = 20

export function RecurringChargesTable({ groups, onStatusChange, selectable, selectedMerchants, onSelectionChange, sortBy, sortOrder, onSort, expandedMerchant, onToggleExpand, pendingRemovals, onUndoPending }: RecurringChargesTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages - 1)
  const paged = groups.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE)

  const sortIcon = (column: SortBy) => {
    if (sortBy !== column) return null
    const Icon = sortOrder === 'asc' ? ArrowUp : ArrowDown
    return <Icon className="inline h-3 w-3 ml-0.5" />
  }

  const sortable = onSort ? 'cursor-pointer select-none' : ''

  const selected = selectedMerchants ?? new Set<string>()
  const allPageSelected = paged.length > 0 && paged.every(g => selected.has(g.merchantName))

  const toggleOne = (merchantName: string) => {
    const next = new Set(selected)
    if (next.has(merchantName)) next.delete(merchantName)
    else next.add(merchantName)
    onSelectionChange?.(next)
  }

  const toggleAll = () => {
    const next = new Set(selected)
    if (allPageSelected) {
      paged.forEach(g => next.delete(g.merchantName))
    } else {
      paged.forEach(g => next.add(g.merchantName))
    }
    onSelectionChange?.(next)
  }

  const hasActions = !!onStatusChange
  const totalColumns = (selectable ? 1 : 0) + 8 + (hasActions ? 1 : 0)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-2">
        Detected ({groups.length})
      </h3>
      {groups.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">
          No recurring charges detected.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {selectable && (
                  <TableHead className="w-8 py-1.5">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                )}
                <TableHead className={`py-1.5 text-xs ${sortable}`} onClick={() => onSort?.('merchantName')}>Merchant{sortIcon('merchantName')}</TableHead>
                <TableHead className={`py-1.5 text-xs ${sortable}`} onClick={() => onSort?.('frequency')}>Freq{sortIcon('frequency')}</TableHead>
                <TableHead className={`py-1.5 text-xs ${sortable}`} onClick={() => onSort?.('category')}>Category{sortIcon('category')}</TableHead>
                <TableHead className={`py-1.5 text-xs text-right ${sortable}`} onClick={() => onSort?.('avgAmount')}>Avg{sortIcon('avgAmount')}</TableHead>
                <TableHead className={`py-1.5 text-xs text-right ${sortable}`} onClick={() => onSort?.('estimatedMonthlyAmount')}>Monthly{sortIcon('estimatedMonthlyAmount')}</TableHead>
                <TableHead className={`py-1.5 text-xs text-center ${sortable}`} onClick={() => onSort?.('occurrences')}>#<span>{sortIcon('occurrences')}</span></TableHead>
                <TableHead className={`py-1.5 text-xs ${sortable}`} onClick={() => onSort?.('lastDate')}>Last{sortIcon('lastDate')}</TableHead>
                {hasActions && <TableHead className="w-16 py-1.5"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.flatMap((group) => {
                const isExpanded = expandedMerchant === group.merchantName
                const isPending = pendingRemovals?.has(group.merchantName)
                const ExpandIcon = isExpanded ? ChevronDown : ChevronRight
                const rows = [
                  <TableRow key={group.merchantName} className={`cursor-pointer${isPending ? ' opacity-40' : ''}`} onClick={() => !isPending && onToggleExpand?.(group.merchantName)}>
                    {selectable && (
                      <TableCell className={`py-1.5${isPending ? ' pointer-events-none' : ''}`} onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(group.merchantName)} onCheckedChange={() => toggleOne(group.merchantName)} />
                      </TableCell>
                    )}
                    <TableCell className="py-1.5 text-xs font-medium">
                      <span className="flex items-center gap-1">
                        <ExpandIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className={isPending ? 'line-through' : ''}>{group.merchantName}</span>
                        {group.unexpectedActivity && (
                          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                        {FREQUENCY_LABELS[group.frequency]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {group.category ? (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0" style={{ borderColor: group.categoryColor ?? undefined, color: group.categoryColor ?? undefined }}>
                          {group.category}
                        </Badge>
                      ) : '\u2014'}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums">{formatCurrencyPrecise(group.avgAmount)}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium">{formatCurrencyPrecise(group.estimatedMonthlyAmount)}</TableCell>
                    <TableCell className="py-1.5 text-xs text-center tabular-nums text-muted-foreground">{group.occurrences}</TableCell>
                    <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{group.lastDate}</TableCell>
                    {hasActions && (
                      <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                        {isPending ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground opacity-100" title="Undo" onClick={() => onUndoPending?.(group.merchantName)}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" />
                            Undo
                          </Button>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="End subscription" onClick={() => onStatusChange?.(group.merchantName, 'ended')}>
                              <StopCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Not recurring" onClick={() => onStatusChange?.(group.merchantName, 'not_recurring')}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ]
                if (isExpanded) {
                  rows.push(
                    <TableRow key={`${group.merchantName}-detail`} className="hover:bg-transparent">
                      <TableCell colSpan={totalColumns} className="p-0">
                        <RecurringRowDetail transactionIds={group.transactionIds} />
                      </TableCell>
                    </TableRow>
                  )
                }
                return rows
              })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {effectivePage * PAGE_SIZE + 1}&ndash;{Math.min((effectivePage + 1) * PAGE_SIZE, groups.length)} of {groups.length}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
