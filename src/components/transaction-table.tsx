'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategorySelect } from './category-select'
import { formatCurrencyPrecise } from '@/lib/format'
import { Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import type { Filters } from '@/components/filter-bar'

interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
  transaction_class: string | null
}

interface Category {
  id: number
  name: string
  color: string
}

interface TransactionTableProps {
  refreshKey?: number
  filters?: Filters
}

type SortBy = 'date' | 'amount' | 'description'
type SortOrder = 'asc' | 'desc'

const PAGE_SIZE = 50

function buildParams(filters: Filters | undefined, page: number, sortBy: SortBy, sortOrder: SortOrder): URLSearchParams {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.document_id) params.set('document_id', filters.document_id)
  if (filters?.category_ids && filters.category_ids.length > 0) {
    params.set('category_ids', filters.category_ids.join(','))
  }
  params.set('sort_by', sortBy)
  params.set('sort_order', sortOrder)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(page * PAGE_SIZE))
  return params
}

export function TransactionTable({ refreshKey, filters }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ type: 'single' | 'bulk'; ids: number[] } | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [filters, refreshKey, sortBy, sortOrder])

  const fetchTransactions = useCallback(async (currentPage: number) => {
    const params = buildParams(filters, currentPage, sortBy, sortOrder)
    const data = await fetch(`/api/transactions?${params}`).then(r => r.json())
    setTransactions(data.transactions)
    setTotal(data.total)
  }, [filters, sortBy, sortOrder])

  useEffect(() => {
    let cancelled = false
    const params = buildParams(filters, page, sortBy, sortOrder)
    fetch(`/api/transactions?${params}`).then(r => r.json()).then(data => {
      if (!cancelled) {
        setTransactions(data.transactions)
        setTotal(data.total)
      }
    })
    return () => { cancelled = true }
  }, [filters, refreshKey, page, sortBy, sortOrder])

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'description' ? 'asc' : 'desc')
    }
  }

  const SortIcon = ({ column }: { column: SortBy }) => {
    if (sortBy !== column) return null
    const Icon = sortOrder === 'asc' ? ArrowUp : ArrowDown
    return <Icon className="inline h-3 w-3 ml-0.5" />
  }

  const updateCategory = async (transactionId: number, categoryId: number) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    })
    await fetchTransactions(page)
  }

  const updateType = async (transactionId: number, type: string) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).catch(() => {})
    await fetchTransactions(page)
  }

  const updateClass = async (transactionId: number, transactionClass: string) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_class: transactionClass }),
    }).catch(() => {})
    await fetchTransactions(page)
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return
    if (deleteDialog.type === 'single') {
      await fetch(`/api/transactions/${deleteDialog.ids[0]}`, { method: 'DELETE' })
    } else {
      await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: deleteDialog.ids }),
      })
    }
    setDeleteDialog(null)
    setSelected(new Set())
    await fetchTransactions(page)
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
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-1.5 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setDeleteDialog({ type: 'bulk', ids: Array.from(selected) })}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 py-2">
              <Checkbox
                checked={transactions.length > 0 && selected.size === transactions.length}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead className="py-2 text-xs cursor-pointer select-none" onClick={() => handleSort('date')}>Date<SortIcon column="date" /></TableHead>
            <TableHead className="py-2 text-xs cursor-pointer select-none" onClick={() => handleSort('description')}>Description<SortIcon column="description" /></TableHead>
            <TableHead className="py-2 text-xs text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>Amount<SortIcon column="amount" /></TableHead>
            <TableHead className="py-2 text-xs">Type</TableHead>
            <TableHead className="py-2 text-xs">Category</TableHead>
            <TableHead className="w-8 py-2"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
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
                    <Select value={txn.type} onValueChange={(v) => updateType(txn.id, v)}>
                      <SelectTrigger className="h-6 w-[72px] border-0 bg-transparent px-1 text-[11px] uppercase tracking-wide shadow-none hover:bg-muted focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debit" className="text-xs">Debit</SelectItem>
                        <SelectItem value="credit" className="text-xs">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={txn.transaction_class ?? 'purchase'} onValueChange={(v) => updateClass(txn.id, v)}>
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
                    onValueChange={(catId) => updateCategory(txn.id, catId)}
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
