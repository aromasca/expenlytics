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
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Transactions</h2>
        <p className="text-sm text-gray-500">Manage your imported transactions</p>
      </div>
      <UploadZone onUploadComplete={handleUploadComplete} />
      <FilterBar filters={filters} onFiltersChange={setFilters} />
      <TransactionTable refreshKey={refreshKey} filters={filters} />
    </div>
  )
}
