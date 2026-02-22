'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronRight, ChevronDown, StopCircle, Ban, AlertTriangle, Undo2, Pencil, Check, X } from 'lucide-react'
import { SortableHeader } from '@/components/shared/sortable-header'
import { formatCurrencyPrecise } from '@/lib/format'
import { CommitmentRowDetail } from '@/components/commitment-row-detail'
import type { CommitmentGroup, CommitmentSortBy, Frequency } from '@/types/commitments'

interface CommitmentTableProps {
  groups: CommitmentGroup[]
  onStatusChange?: (merchantName: string, status: 'ended' | 'not_recurring') => void
  onOverrideChange?: (merchant: string, frequencyOverride: string | null, monthlyAmountOverride: number | null) => void
  selectable?: boolean
  selectedMerchants?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
  sortBy?: CommitmentSortBy
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: CommitmentSortBy) => void
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

const FREQUENCY_OPTIONS: { value: Frequency | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi-annual', label: '2x/yr' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'irregular', label: 'Irregular' },
]

function InlineMonthlyInput({ value, onSave, onCancel }: { value: number; onSave: (v: number | null) => void; onCancel: () => void }) {
  const [input, setInput] = useState(value.toFixed(2))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.select() }, [])
  const handleSave = () => {
    const num = parseFloat(input)
    if (!isNaN(num) && num > 0) onSave(Math.round(num * 100) / 100)
    else onCancel()
  }
  return (
    <span className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      <Input
        ref={ref}
        type="number"
        step="0.01"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        className="h-6 w-20 text-xs tabular-nums px-1"
      />
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleSave}><Check className="h-3 w-3" /></Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onCancel}><X className="h-3 w-3" /></Button>
    </span>
  )
}

export function CommitmentTable({ groups, onStatusChange, onOverrideChange, selectable, selectedMerchants, onSelectionChange, sortBy, sortOrder, onSort, expandedMerchant, onToggleExpand, pendingRemovals, onUndoPending }: CommitmentTableProps) {
  const [page, setPage] = useState(0)
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null)
  const [editField, setEditField] = useState<'frequency' | 'monthly' | null>(null)
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages - 1)
  const paged = groups.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE)

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
                {onSort && sortBy && sortOrder ? (
                  <>
                    <SortableHeader column="merchantName" label="Merchant" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs" />
                    <SortableHeader column="frequency" label="Freq" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs" />
                    <SortableHeader column="category" label="Category" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs" />
                    <SortableHeader column="avgAmount" label="Avg" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs text-right" />
                    <SortableHeader column="estimatedMonthlyAmount" label="Monthly" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs text-right" />
                    <SortableHeader column="occurrences" label="#" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs text-center" />
                    <SortableHeader column="lastDate" label="Last" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="py-1.5 text-xs" />
                  </>
                ) : (
                  <>
                    <TableHead className="py-1.5 text-xs">Merchant</TableHead>
                    <TableHead className="py-1.5 text-xs">Freq</TableHead>
                    <TableHead className="py-1.5 text-xs">Category</TableHead>
                    <TableHead className="py-1.5 text-xs text-right">Avg</TableHead>
                    <TableHead className="py-1.5 text-xs text-right">Monthly</TableHead>
                    <TableHead className="py-1.5 text-xs text-center">#</TableHead>
                    <TableHead className="py-1.5 text-xs">Last</TableHead>
                  </>
                )}
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
                    <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                      {editingMerchant === group.merchantName && editField === 'frequency' ? (
                        <select
                          className="h-6 text-[11px] rounded border bg-background px-1"
                          value={group.frequencyOverride ?? 'auto'}
                          autoFocus
                          onChange={e => {
                            const val = e.target.value
                            const freq = val === 'auto' ? null : val
                            onOverrideChange?.(group.merchantName, freq, group.monthlyAmountOverride ?? null)
                            setEditingMerchant(null)
                            setEditField(null)
                          }}
                          onBlur={() => { setEditingMerchant(null); setEditField(null) }}
                        >
                          {FREQUENCY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="group/freq inline-flex items-center gap-0.5">
                          <Badge variant={group.frequencyOverride ? 'default' : 'outline'} className="text-[11px] px-1.5 py-0">
                            {FREQUENCY_LABELS[group.frequency]}
                          </Badge>
                          {onOverrideChange && (
                            <button
                              className="opacity-0 group-hover/freq:opacity-100 transition-opacity"
                              onClick={() => { setEditingMerchant(group.merchantName); setEditField('frequency') }}
                            >
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {group.category ? (
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0" style={{ borderColor: group.categoryColor ?? undefined, color: group.categoryColor ?? undefined }}>
                          {group.category}
                        </Badge>
                      ) : '\u2014'}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums">{formatCurrencyPrecise(group.avgAmount)}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium" onClick={e => e.stopPropagation()}>
                      {editingMerchant === group.merchantName && editField === 'monthly' ? (
                        <InlineMonthlyInput
                          value={group.estimatedMonthlyAmount}
                          onSave={v => {
                            onOverrideChange?.(group.merchantName, group.frequencyOverride ?? null, v)
                            setEditingMerchant(null)
                            setEditField(null)
                          }}
                          onCancel={() => { setEditingMerchant(null); setEditField(null) }}
                        />
                      ) : (
                        <span className="group/monthly inline-flex items-center justify-end gap-0.5">
                          <span className={group.monthlyAmountOverride != null ? 'underline decoration-dotted' : ''}>
                            {formatCurrencyPrecise(group.estimatedMonthlyAmount)}
                          </span>
                          {onOverrideChange && (
                            <button
                              className="opacity-0 group-hover/monthly:opacity-100 transition-opacity"
                              onClick={() => { setEditingMerchant(group.merchantName); setEditField('monthly') }}
                            >
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                          )}
                        </span>
                      )}
                    </TableCell>
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
                        <CommitmentRowDetail transactionIds={group.transactionIds} />
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
