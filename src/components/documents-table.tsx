'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ProcessingStatus } from '@/components/processing-status'
import { RotateCw, Trash2, RefreshCw } from 'lucide-react'
import { SortableHeader } from '@/components/shared/sortable-header'
import type { DocumentRow, DocumentSortBy } from '@/types/documents'

interface DocumentsTableProps {
  documents: DocumentRow[]
  onRefresh: () => void
  sortBy: DocumentSortBy
  sortOrder: 'asc' | 'desc'
  onSort: (column: DocumentSortBy) => void
}

export function DocumentsTable({ documents, onRefresh, sortBy, sortOrder, onSort }: DocumentsTableProps) {
  const [actionInProgress, setActionInProgress] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchInProgress, setBatchInProgress] = useState(false)

  const completedDocs = documents.filter(d => d.status === 'completed')
  const allCompletedSelected = completedDocs.length > 0 && completedDocs.every(d => selected.has(d.id))

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allCompletedSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(completedDocs.map(d => d.id)))
    }
  }

  const handleBatchReprocess = async () => {
    const ids = Array.from(selected).filter(id =>
      documents.find(d => d.id === id)?.status === 'completed'
    )
    if (ids.length === 0) return

    setBatchInProgress(true)
    await Promise.all(
      ids.map(id =>
        fetch(`/api/documents/${id}/reprocess`, { method: 'POST' }).catch(() => {})
      )
    )
    setSelected(new Set())
    setBatchInProgress(false)
    onRefresh()
  }

  const handleReprocess = async (docId: number) => {
    setActionInProgress(docId)
    try {
      await fetch(`/api/documents/${docId}/reprocess`, { method: 'POST' })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDelete = async (docId: number) => {
    if (!confirm('Delete this document and all its transactions?')) return
    setActionInProgress(docId)
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      setSelected(prev => { const next = new Set(prev); next.delete(docId); return next })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  const handleRetry = async (docId: number) => {
    setActionInProgress(docId)
    try {
      await fetch(`/api/documents/${docId}/retry`, { method: 'POST' })
      onRefresh()
    } catch {
      // Error handling
    } finally {
      setActionInProgress(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No documents uploaded yet. Drop a PDF above to get started.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={batchInProgress}
            onClick={handleBatchReprocess}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            {batchInProgress ? 'Reprocessing...' : 'Reprocess Selected'}
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={allCompletedSelected && completedDocs.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <SortableHeader column="filename" label="File" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-left font-medium text-muted-foreground px-3 py-2" />
              <SortableHeader column="uploaded_at" label="Uploaded" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-left font-medium text-muted-foreground px-3 py-2" />
              <SortableHeader column="document_type" label="Type" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-left font-medium text-muted-foreground px-3 py-2" />
              <SortableHeader column="status" label="Status" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-left font-medium text-muted-foreground px-3 py-2" />
              <SortableHeader column="actual_transaction_count" label="Txns" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort} className="text-right font-medium text-muted-foreground px-3 py-2 tabular-nums" />
              <th className="text-right font-medium text-muted-foreground px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map(doc => (
              <tr key={doc.id} className="border-b last:border-b-0">
                <td className="px-3 py-1.5">
                  {doc.status === 'completed' ? (
                    <Checkbox
                      checked={selected.has(doc.id)}
                      onCheckedChange={() => toggleSelect(doc.id)}
                      aria-label={`Select ${doc.filename}`}
                    />
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                </td>
                <td className="px-3 py-1.5 font-medium truncate max-w-48" title={doc.filename}>
                  {doc.filename}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {new Date(doc.uploaded_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {doc.document_type?.replace(/_/g, ' ') ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  <ProcessingStatus
                    status={doc.status}
                    phase={doc.processing_phase}
                    errorMessage={doc.error_message}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {doc.actual_transaction_count || '—'}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {doc.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        title="Retry"
                        disabled={actionInProgress === doc.id}
                        onClick={() => handleRetry(doc.id)}
                      >
                        <RotateCw className="h-3 w-3" />
                      </Button>
                    )}
                    {doc.status === 'completed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        title="Reprocess"
                        disabled={actionInProgress === doc.id}
                        onClick={() => handleReprocess(doc.id)}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                    {doc.status !== 'processing' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete"
                        disabled={actionInProgress === doc.id}
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
