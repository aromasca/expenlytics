'use client'

import { useState, useEffect, useRef } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { CategoryBadge } from './category-badge'
import { CategorySelect } from './category-select'

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
}

async function fetchTransactionsData(search: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const res = await fetch(`/api/transactions?${params}`)
  return res.json()
}

async function fetchCategoriesData() {
  const res = await fetch('/api/categories')
  return res.json()
}

export function TransactionTable({ refreshKey }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const refreshRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetchCategoriesData().then(data => {
      if (!cancelled) setCategories(data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    refreshRef.current++
    fetchTransactionsData(search).then(data => {
      if (!cancelled) {
        setTransactions(data.transactions)
        setTotal(data.total)
      }
    })
    return () => { cancelled = true }
  }, [search, refreshKey])

  const updateCategory = async (transactionId: number, categoryId: number) => {
    await fetch(`/api/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId }),
    })
    const data = await fetchTransactionsData(search)
    setTransactions(data.transactions)
    setTotal(data.total)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-gray-500">{total} transactions</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                No transactions yet. Upload a bank statement to get started.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((txn) => (
              <TableRow key={txn.id}>
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
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
