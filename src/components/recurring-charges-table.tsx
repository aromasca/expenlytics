'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { X } from 'lucide-react'
import { formatCurrencyPrecise } from '@/lib/format'

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

interface RecurringChargesTableProps {
  groups: RecurringGroup[]
  onDismiss?: (merchantName: string) => void
  selectable?: boolean
  selectedMerchants?: Set<string>
  onSelectionChange?: (selected: Set<string>) => void
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular',
}

const PAGE_SIZE = 20

export function RecurringChargesTable({ groups, onDismiss, selectable, selectedMerchants, onSelectionChange }: RecurringChargesTableProps) {
  const [page, setPage] = useState(0)
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
                <TableHead className="py-1.5 text-xs">Merchant</TableHead>
                <TableHead className="py-1.5 text-xs">Freq</TableHead>
                <TableHead className="py-1.5 text-xs">Category</TableHead>
                <TableHead className="py-1.5 text-xs text-right">Avg</TableHead>
                <TableHead className="py-1.5 text-xs text-right">Monthly</TableHead>
                <TableHead className="py-1.5 text-xs text-center">#</TableHead>
                <TableHead className="py-1.5 text-xs">Last</TableHead>
                {onDismiss && <TableHead className="w-8 py-1.5"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((group) => (
                <TableRow key={group.merchantName}>
                  {selectable && (
                    <TableCell className="py-1.5">
                      <Checkbox checked={selected.has(group.merchantName)} onCheckedChange={() => toggleOne(group.merchantName)} />
                    </TableCell>
                  )}
                  <TableCell className="py-1.5 text-xs font-medium">{group.merchantName}</TableCell>
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
                    ) : '—'}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{formatCurrencyPrecise(group.avgAmount)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium">{formatCurrencyPrecise(group.estimatedMonthlyAmount)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-center tabular-nums text-muted-foreground">{group.occurrences}</TableCell>
                  <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{group.lastDate}</TableCell>
                  {onDismiss && (
                    <TableCell className="py-1.5">
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" title="Dismiss" onClick={() => onDismiss(group.merchantName)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
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
