'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategorySelect } from './category-select'
import { formatCurrencyPrecise } from '@/lib/format'
import { Trash2 } from 'lucide-react'
import { SortableHeader } from '@/components/shared/sortable-header'
import { SelectionBar } from '@/components/shared/selection-bar'
import type { Filters } from '@/types/filters'
import type { SortOrder } from '@/types/common'
import { useCategories } from '@/hooks/use-categories'
import { useTransactions, useUpdateTransaction, useBulkUpdateTransactions, useDeleteTransactions } from '@/hooks/use-transactions'

interface TransactionTableProps {
  refreshKey?: number
  filters?: Filters
}

type SortBy = 'date' | 'amount' | 'description'

const PAGE_SIZE = 50

export function TransactionTable({ refreshKey, filters }: TransactionTableProps) {
  const { data: categories = [] } = useCategories()
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'single' | 'bulk'; ids: number[] } | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  useEffect(() => {
    setTimeout(() => {
      setPage(0)
      setSelected(new Set())
    }, 0)
  }, [filters, refreshKey, sortBy, sortOrder])

  const { data, isLoading: loading } = useTransactions(filters, page, sortBy, sortOrder)
  const transactions = data?.transactions ?? []
  const total = data?.total ?? 0

  const updateTransaction = useUpdateTransaction()
  const bulkUpdate = useBulkUpdateTransactions()
  const deleteTransactions = useDeleteTransactions()

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'description' ? 'asc' : 'desc')
    }
  }

  const updateTransactions = (ids: number[], updates: Record<string, unknown>) => {
    if (ids.length === 1) {
      updateTransaction.mutate({ id: ids[0], updates })
    } else {
      bulkUpdate.mutate({ ids, updates })
      setSelected(new Set())
    }
  }

  const confirmDelete = () => {
    if (!deleteDialog) return
    deleteTransactions.mutate(deleteDialog.ids, {
      onSettled: () => {
        setDeleteDialog(null)
        setSelected(new Set())
      },
    })
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(t => t.id)))
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start = page * PAGE_SIZE + 1
  const end = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <div className="space-y-2">
      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())} variant="inline">
        <div className="flex items-center gap-2">
          <CategorySelect
            categories={categories}
            value={null}
            placeholder="Set category..."
            onValueChange={(catId) => updateTransactions(Array.from(selected), { category_id: catId })}
          />
          <Select value="" onValueChange={(v) => updateTransactions(Array.from(selected), { type: v })}>
            <SelectTrigger className="h-6 w-[100px] text-xs">
              <SelectValue placeholder="Set type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit" className="text-xs">Debit</SelectItem>
              <SelectItem value="credit" className="text-xs">Credit</SelectItem>
            </SelectContent>
          </Select>
          <Select value="" onValueChange={(v) => updateTransactions(Array.from(selected), { transaction_class: v })}>
            <SelectTrigger className="h-6 w-[110px] text-xs">
              <SelectValue placeholder="Set class..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase" className="text-xs">purchase</SelectItem>
              <SelectItem value="payment" className="text-xs">payment</SelectItem>
              <SelectItem value="refund" className="text-xs">refund</SelectItem>
              <SelectItem value="fee" className="text-xs">fee</SelectItem>
              <SelectItem value="interest" className="text-xs">interest</SelectItem>
              <SelectItem value="transfer" className="text-xs">transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setDeleteDialog({ type: 'bulk', ids: Array.from(selected) })}
        >
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </SelectionBar>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 py-2">
              <Checkbox
                checked={transactions.length > 0 && selected.size === transactions.length}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <SortableHeader column="date" label="Date" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="py-2 text-xs" />
            <SortableHeader column="description" label="Description" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="py-2 text-xs" />
            <SortableHeader column="amount" label="Amount" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="py-2 text-xs text-right" />
            <TableHead className="py-2 text-xs">Type</TableHead>
            <TableHead className="py-2 text-xs">Category</TableHead>
            <TableHead className="w-8 py-2"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                Loading...
              </TableCell>
            </TableRow>
          ) : transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-xs">
                No transactions found.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((txn) => (
              <TableRow key={txn.id} className={selected.has(txn.id) ? 'bg-muted/50' : ''}>
                <TableCell className="py-1.5">
                  <Checkbox
                    checked={selected.has(txn.id)}
                    onCheckedChange={() => toggleSelect(txn.id)}
                  />
                </TableCell>
                <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{txn.date}</TableCell>
                <TableCell className="py-1.5 text-xs">{txn.description}</TableCell>
                <TableCell className={`py-1.5 text-xs text-right tabular-nums font-medium ${txn.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {txn.type === 'credit' ? '+' : '-'}{formatCurrencyPrecise(txn.amount)}
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Select value={txn.type} onValueChange={(v) => updateTransactions([txn.id], { type: v })}>
                      <SelectTrigger className="h-6 w-[72px] border-0 bg-transparent px-1 text-[11px] uppercase tracking-wide shadow-none hover:bg-muted focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debit" className="text-xs">Debit</SelectItem>
                        <SelectItem value="credit" className="text-xs">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={txn.transaction_class ?? 'purchase'} onValueChange={(v) => updateTransactions([txn.id], { transaction_class: v })}>
                      <SelectTrigger className="h-6 w-[88px] border-0 bg-transparent px-1 text-[10px] shadow-none hover:bg-muted focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase" className="text-xs">purchase</SelectItem>
                        <SelectItem value="payment" className="text-xs">payment</SelectItem>
                        <SelectItem value="refund" className="text-xs">refund</SelectItem>
                        <SelectItem value="fee" className="text-xs">fee</SelectItem>
                        <SelectItem value="interest" className="text-xs">interest</SelectItem>
                        <SelectItem value="transfer" className="text-xs">transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <CategorySelect
                    categories={categories}
                    value={txn.category_id}
                    onValueChange={(catId) => updateTransactions([txn.id], { category_id: catId })}
                  />
                </TableCell>
                <TableCell className="py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => setDeleteDialog({ type: 'single', ids: [txn.id] })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {start}&ndash;{end} of {total}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Prev
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteDialog !== null} onOpenChange={(open) => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteDialog?.type === 'bulk' ? `${deleteDialog.ids.length} transactions` : 'transaction'}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
