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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(() => {
    fetch('/api/documents')
      .then(res => res.json())
      .then(data => {
        setDocuments(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

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

      <UploadZone onUploadComplete={fetchDocuments} />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DocumentsTable documents={documents} onRefresh={fetchDocuments} />
      )}
    </div>
  )
}
