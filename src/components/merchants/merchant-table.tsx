'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw } from 'lucide-react'
import { SortableHeader } from '@/components/shared/sortable-header'
import { formatCurrencyPrecise } from '@/lib/format'
import { MerchantExpand } from './merchant-expand'
import type { MerchantInfo, MerchantSortBy, DescriptionGroup } from '@/types/merchants'

interface MerchantTableProps {
  merchants: MerchantInfo[]
  sorted: MerchantInfo[]
  loading: boolean
  search: string
  sortBy: MerchantSortBy
  sortOrder: 'asc' | 'desc'
  selectedMerchants: Set<string>
  expandedMerchant: string | null
  expandedGroup: string | null
  selectedDescriptionGroups: Map<string, DescriptionGroup>
  selectedTransactionIds: Set<number>
  onSort: (column: MerchantSortBy) => void
  onToggleSelect: (merchant: string) => void
  onToggleSelectAll: () => void
  onToggleExpand: (merchant: string) => void
  onToggleDescriptionGroup: (description: string, group: DescriptionGroup) => void
  onToggleExpandGroup: (description: string) => void
  onToggleTransactionSelect: (id: number) => void
}

export function MerchantTable({
  merchants,
  sorted,
  loading,
  search,
  sortBy,
  sortOrder,
  selectedMerchants,
  expandedMerchant,
  expandedGroup,
  selectedDescriptionGroups,
  selectedTransactionIds,
  onSort,
  onToggleSelect,
  onToggleSelectAll,
  onToggleExpand,
  onToggleDescriptionGroup,
  onToggleExpandGroup,
  onToggleTransactionSelect,
}: MerchantTableProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (merchants.length === 0) {
    return (
      <Card className="p-3">
        <p className="text-center text-muted-foreground py-6 text-xs">
          {search ? 'No merchants match your search.' : 'No merchants found.'}
        </p>
      </Card>
    )
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={selectedMerchants.size === merchants.length && merchants.length > 0}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <SortableHeader column="merchant" label="Merchant" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-xs" />
            <SortableHeader column="transactionCount" label="Txns" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-xs text-right" />
            <SortableHeader column="totalAmount" label="Total" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-xs text-right" />
            <SortableHeader column="categoryName" label="Category" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-xs" />
            <SortableHeader column="lastDate" label="Date Range" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-xs text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(m => (
            <React.Fragment key={m.merchant}>
              <TableRow className="cursor-pointer" onClick={() => onToggleExpand(m.merchant)}>
                <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedMerchants.has(m.merchant)}
                    onCheckedChange={() => onToggleSelect(m.merchant)}
                    onClick={e => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell className="py-1.5 text-xs font-medium">{m.merchant}</TableCell>
                <TableCell className="py-1.5 text-xs text-right tabular-nums">{m.transactionCount}</TableCell>
                <TableCell className="py-1.5 text-xs text-right tabular-nums">{formatCurrencyPrecise(m.totalAmount)}</TableCell>
                <TableCell className="py-1.5">
                  {m.categoryName ? (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-1.5 py-0"
                      style={m.categoryColor ? { borderColor: m.categoryColor, color: m.categoryColor } : undefined}
                    >
                      {m.categoryName}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-xs text-right text-muted-foreground tabular-nums">
                  {m.firstDate} — {m.lastDate}
                </TableCell>
              </TableRow>
              {expandedMerchant === m.merchant && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <div className="bg-muted/30 px-8 py-2 space-y-1">
                      <MerchantExpand
                        merchant={m.merchant}
                        expandedGroup={expandedGroup}
                        selectedDescriptionGroups={selectedDescriptionGroups}
                        selectedTransactionIds={selectedTransactionIds}
                        onToggleDescriptionGroup={onToggleDescriptionGroup}
                        onToggleExpandGroup={onToggleExpandGroup}
                        onToggleTransactionSelect={onToggleTransactionSelect}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
