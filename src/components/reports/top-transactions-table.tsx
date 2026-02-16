'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrencyPrecise } from '@/lib/format'

interface TopTransactionsTableProps {
  data: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
}

const PAGE_SIZE = 10

export function TopTransactionsTable({ data }: TopTransactionsTableProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const paged = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <Card className="p-3">
      <h3 className="text-xs font-medium text-muted-foreground mb-3">Top Transactions</h3>
      {data.length === 0 ? (
        <p className="text-center text-muted-foreground py-6 text-xs">No data</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="py-1.5 text-xs">Date</TableHead>
                <TableHead className="py-1.5 text-xs">Description</TableHead>
                <TableHead className="py-1.5 text-xs">Category</TableHead>
                <TableHead className="py-1.5 text-xs text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(txn => (
                <TableRow key={txn.id}>
                  <TableCell className="py-1.5 text-xs tabular-nums text-muted-foreground">{txn.date}</TableCell>
                  <TableCell className="py-1.5 text-xs">{txn.description}</TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground">{txn.category ?? 'Uncategorized'}</TableCell>
                  <TableCell className={`py-1.5 text-xs text-right tabular-nums font-medium ${txn.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    {txn.type === 'credit' ? '+' : '-'}{formatCurrencyPrecise(txn.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, data.length)} of {data.length}
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
