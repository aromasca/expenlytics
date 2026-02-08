'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { X } from 'lucide-react'

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

const FREQUENCY_COLORS: Record<string, string> = {
  weekly: '#3B82F6',
  monthly: '#22C55E',
  quarterly: '#F97316',
  yearly: '#A855F7',
  irregular: '#6B7280',
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
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">
        Detected Recurring Charges ({groups.length})
      </h3>
      {groups.length === 0 ? (
        <p className="text-center text-gray-400 py-8">
          No recurring charges detected. Upload more statements to improve detection.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                <TableHead>Merchant</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Avg Charge</TableHead>
                <TableHead className="text-right">Monthly Est.</TableHead>
                <TableHead className="text-center">Charges</TableHead>
                <TableHead>Last Charge</TableHead>
                {onDismiss && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((group) => (
                <TableRow key={group.merchantName}>
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(group.merchantName)}
                        onCheckedChange={() => toggleOne(group.merchantName)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-sm">
                    {group.merchantName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: FREQUENCY_COLORS[group.frequency],
                        color: FREQUENCY_COLORS[group.frequency],
                      }}
                    >
                      {FREQUENCY_LABELS[group.frequency]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {group.category ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: group.categoryColor ?? undefined,
                          color: group.categoryColor ?? undefined,
                        }}
                      >
                        {group.category}
                      </Badge>
                    ) : (
                      'Uncategorized'
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    ${group.avgAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    ${group.estimatedMonthlyAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-gray-500">
                    {group.occurrences}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {group.lastDate}
                  </TableCell>
                  {onDismiss && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        title="Not a subscription"
                        onClick={() => onDismiss(group.merchantName)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                {effectivePage * PAGE_SIZE + 1}–{Math.min((effectivePage + 1) * PAGE_SIZE, groups.length)} of {groups.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
