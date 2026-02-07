'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoryBadge } from './category-badge'
import { CategorySelect } from './category-select'
import { Trash2 } from 'lucide-react'
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
}

interface Category {
  id: number
  name: string
  color: string
}

interface TransactionTableProps {
  refreshKey: number
  filters?: Filters
}

const PAGE_SIZE = 50

function buildParams(filters: Filters | undefined, page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.document_id) params.set('document_id', filters.document_id)
  if (filters?.category_ids && filters.category_ids.length > 0) {
    params.set('category_ids', filters.category_ids.join(','))
  }
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    })
    return () => { cancelled = true }
  }, [])

  // Reset page and selection when filters or refreshKey change
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [filters, refreshKey])

  // Fetch transactions
  const fetchTransactions = useCallback(async (currentPage: number) => {
    const params = buildParams(filters, currentPage)
    const data = await fetch(`/api/transactions?${params}`).then(r => r.json())
    setTransactions(data.transactions)
    setTotal(data.total)
  }, [filters])

  useEffect(() => {
    let cancelled = false
    const params = buildParams(filters, page)
    fetch(`/api/transactions?${params}`).then(r => r.json()).then(data => {
      if (!cancelled) {
        setTransactions(data.transactions)
        setTotal(data.total)
      }
    })
    return () => { cancelled = true }
  }, [filters, refreshKey, page])

  const updateCategory = async (transactionId: number, categoryId: number) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    })
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
    <div className="space-y-4">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-4 rounded-md bg-blue-50 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialog({ type: 'bulk', ids: Array.from(selected) })}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={transactions.length > 0 && selected.size === transactions.length}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                No transactions found.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((txn) => (
              <TableRow key={txn.id} className={selected.has(txn.id) ? 'bg-blue-50/50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(txn.id)}
                    onCheckedChange={() => toggleSelect(txn.id)}
                  />
                </TableCell>
                <TableCell>{txn.date}</TableCell>
                <TableCell>{txn.description}</TableCell>
                <TableCell className={`text-right ${txn.type === 'credit' ? 'text-green-600' : ''}`}>
                  {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                </TableCell>
                <TableCell>
                  <span className={`text-xs uppercase ${txn.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                    {txn.type}
                  </span>
                </TableCell>
                <TableCell>
                  {txn.category_name ? (
                    <div className="flex items-center gap-2">
                      <CategoryBadge name={txn.category_name} color={txn.category_color!} />
                      <CategorySelect
                        categories={categories}
                        value={txn.category_id}
                        onValueChange={(catId) => updateCategory(txn.id, catId)}
                      />
                    </div>
                  ) : (
                    <CategorySelect
                      categories={categories}
                      value={null}
                      onValueChange={(catId) => updateCategory(txn.id, catId)}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-red-500"
                    onClick={() => setDeleteDialog({ type: 'single', ids: [txn.id] })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {start}-{end} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialog !== null} onOpenChange={(open) => { if (!open) setDeleteDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteDialog?.type === 'bulk' ? `${deleteDialog.ids.length} transactions` : 'transaction'}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. {deleteDialog?.type === 'bulk'
                ? `${deleteDialog.ids.length} transactions will be permanently deleted.`
                : 'This transaction will be permanently deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
