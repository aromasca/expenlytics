'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { DocumentsTable } from '@/components/documents-table'
import type { DocumentSortBy } from '@/types/documents'
import type { SortOrder } from '@/types/common'
import { useDocuments } from '@/hooks/use-documents'

export default function DocumentsPage() {
  const [sortBy, setSortBy] = useState<DocumentSortBy>('uploaded_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const { data: documents = [], isLoading: loading, refetch } = useDocuments(sortBy, sortOrder)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Documents</h1>
      </div>

      <div data-walkthrough="upload">
        <UploadZone onUploadComplete={refetch} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DocumentsTable
          documents={documents}
          onRefresh={refetch}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(column: DocumentSortBy) => {
            if (sortBy === column) {
              setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
            } else {
              setSortBy(column)
              setSortOrder(column === 'filename' || column === 'document_type' || column === 'status' ? 'asc' : 'desc')
            }
          }}
        />
      )}
    </div>
  )
}
