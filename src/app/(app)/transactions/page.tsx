'use client'

import { useState, useCallback } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { TransactionTable } from '@/components/transaction-table'
import { FilterBar, EMPTY_FILTERS, type Filters } from '@/components/filter-bar'

export default function TransactionsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const handleUploadComplete = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Transactions</h2>
      <UploadZone onUploadComplete={handleUploadComplete} />
      <FilterBar filters={filters} onFiltersChange={setFilters} />
      <TransactionTable refreshKey={refreshKey} filters={filters} />
    </div>
  )
}
