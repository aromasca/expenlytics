'use client'

import { useState, useEffect, useCallback } from 'react'
import { UploadZone } from '@/components/upload-zone'
import { DocumentsTable } from '@/components/documents-table'

interface DocumentRow {
  id: number
  filename: string
  uploaded_at: string
  status: string
  processing_phase: string | null
  error_message: string | null
  document_type: string | null
  transaction_count: number | null
  actual_transaction_count: number
}

type SortBy = 'filename' | 'uploaded_at' | 'document_type' | 'status' | 'actual_transaction_count'
type SortOrder = 'asc' | 'desc'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortBy>('uploaded_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const fetchDocuments = useCallback(() => {
    fetch(`/api/documents?sort_by=${sortBy}&sort_order=${sortOrder}`)
      .then(res => res.json())
      .then(data => {
        setDocuments(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sortBy, sortOrder])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Auto-poll when any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing')
    if (!hasProcessing) return

    const interval = setInterval(fetchDocuments, 2000)
    return () => clearInterval(interval)
  }, [documents, fetchDocuments])

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Documents</h1>
      </div>

      <div data-walkthrough="upload">
        <UploadZone onUploadComplete={fetchDocuments} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DocumentsTable
          documents={documents}
          onRefresh={fetchDocuments}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(column: SortBy) => {
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
