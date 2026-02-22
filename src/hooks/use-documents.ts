import { useQuery } from '@tanstack/react-query'
import type { DocumentRow, DocumentSortBy } from '@/types/documents'
import type { SortOrder } from '@/types/common'

export function useDocuments(sortBy: DocumentSortBy = 'uploaded_at', sortOrder: SortOrder = 'desc') {
  return useQuery<DocumentRow[]>({
    queryKey: ['documents', sortBy, sortOrder],
    queryFn: async () => {
      const res = await fetch(`/api/documents?sort_by=${sortBy}&sort_order=${sortOrder}`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    refetchInterval: (query) => {
      const docs = query.state.data
      if (docs?.some(d => d.status === 'processing')) return 2000
      return false
    },
  })
}

/** Lightweight version for filter bar — just needs id + filename */
export function useDocumentList() {
  return useQuery<Array<{ id: number; filename: string }>>({
    queryKey: ['documents', 'list'],
    queryFn: async () => {
      const res = await fetch('/api/documents')
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    staleTime: 60_000,
  })
}
