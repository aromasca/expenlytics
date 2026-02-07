'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface TopTransactionsTableProps {
  data: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
}

const PAGE_SIZE = 10

export function TopTransactionsTable({ data }: TopTransactionsTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const paged = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Top Transactions</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(txn => (
                <TableRow key={txn.id}>
                  <TableCell className="text-sm">{txn.date}</TableCell>
                  <TableCell className="text-sm">{txn.description}</TableCell>
                  <TableCell className="text-sm text-gray-500">{txn.category ?? 'Uncategorized'}</TableCell>
                  <TableCell className={`text-sm text-right ${txn.type === 'credit' ? 'text-green-600' : ''}`}>
                    {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.length)} of {data.length}
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
