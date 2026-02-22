'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TransactionTable } from '@/components/transaction-table'
import { FilterBar } from '@/components/filter-bar'
import { EMPTY_FILTERS, type Filters } from '@/types/filters'
import { FlaggedTransactions } from '@/components/flagged-transactions'
import { Download } from 'lucide-react'
import { useFlagCount } from '@/hooks/use-transactions'

function exportCsv(filters: Filters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.type) params.set('type', filters.type)
  if (filters.start_date) params.set('start_date', filters.start_date)
  if (filters.end_date) params.set('end_date', filters.end_date)
  if (filters.document_id) params.set('document_id', filters.document_id)
  if (filters.category_ids && filters.category_ids.length > 0) {
    params.set('category_ids', filters.category_ids.join(','))
  }
  params.set('limit', '100000')
  params.set('offset', '0')

  fetch(`/api/transactions?${params}`)
    .then(res => res.json())
    .then(({ transactions }: { transactions: Array<{ date: string; description: string; amount: number; type: string; category_name: string | null; transaction_class: string | null }> }) => {
      const header = 'Date,Description,Amount,Type,Category,Class'
      const rows = transactions.map(t => {
        const desc = t.description.includes(',') ? `"${t.description.replace(/"/g, '""')}"` : t.description
        const sign = t.type === 'debit' ? '-' : ''
        return `${t.date},${desc},${sign}${t.amount},${t.type},${t.category_name ?? ''},${t.transaction_class ?? ''}`
      })
      const csv = [header, ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch(() => {})
}

function TransactionsContent() {
  const searchParams = useSearchParams()
  const [showFlagged, setShowFlagged] = useState(false)
  const { data: flagCount = 0 } = useFlagCount()

  const [filters, setFilters] = useState<Filters>(() => {
    const initial = { ...EMPTY_FILTERS }
    const search = searchParams.get('search')
    if (search) initial.search = search
    const categoryId = searchParams.get('category_id')
    if (categoryId) initial.category_ids = [Number(categoryId)]
    return initial
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <div className="flex gap-1">
            <Button
              variant={showFlagged ? 'ghost' : 'default'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowFlagged(false)}
            >
              All
            </Button>
            <Button
              variant={showFlagged ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowFlagged(true)}
            >
              Flagged
              {flagCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 text-[10px] px-1">{flagCount}</Badge>
              )}
            </Button>
          </div>
        </div>
        <Button variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => exportCsv(filters)}>
          <Download className="h-3.5 w-3.5 mr-1" />
          Export CSV
        </Button>
      </div>
      {!showFlagged && <FilterBar filters={filters} onFiltersChange={setFilters} />}
      <div data-walkthrough="transactions">
        {showFlagged ? (
          <FlaggedTransactions />
        ) : (
          <TransactionTable filters={filters} />
        )}
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsContent />
    </Suspense>
  )
}
