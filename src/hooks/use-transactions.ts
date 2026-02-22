import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Transaction, FlaggedTransaction } from '@/types/transactions'
import type { Filters } from '@/types/filters'
import type { SortOrder } from '@/types/common'

type TransactionSortBy = 'date' | 'amount' | 'description'

function buildParams(filters: Filters | undefined, page: number, sortBy: TransactionSortBy, sortOrder: SortOrder): URLSearchParams {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.type) params.set('type', filters.type)
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  if (filters?.document_id) params.set('document_id', filters.document_id)
  if (filters?.category_ids?.length) params.set('category_ids', filters.category_ids.join(','))
  params.set('limit', '50')
  params.set('offset', String(page * 50))
  params.set('sort_by', sortBy)
  params.set('sort_order', sortOrder)
  return params
}

export function useTransactions(filters: Filters | undefined, page: number, sortBy: TransactionSortBy, sortOrder: SortOrder) {
  return useQuery<{ transactions: Transaction[]; total: number }>({
    queryKey: ['transactions', filters, page, sortBy, sortOrder],
    queryFn: async () => {
      const params = buildParams(filters, page, sortBy, sortOrder)
      const res = await fetch(`/api/transactions?${params}`)
      if (!res.ok) throw new Error('Failed to fetch transactions')
      return res.json()
    },
  })
}

export function useFlagCount() {
  return useQuery<number>({
    queryKey: ['transactions', 'flagCount'],
    queryFn: async () => {
      const res = await fetch('/api/transactions?flag_count=true')
      if (!res.ok) throw new Error('Failed to fetch flag count')
      const data = await res.json()
      return data.count
    },
  })
}

export function useFlaggedTransactions() {
  return useQuery<FlaggedTransaction[]>({
    queryKey: ['transactions', 'flagged'],
    queryFn: async () => {
      const res = await fetch('/api/transactions?flagged=true')
      if (!res.ok) throw new Error('Failed to fetch flagged transactions')
      const data = await res.json()
      return data.transactions
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, unknown> }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('Failed to update transaction')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useBulkUpdateTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: number[]; updates: Record<string, unknown> }) => {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, ...updates }),
      })
      if (!res.ok) throw new Error('Failed to bulk update transactions')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useDeleteTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 1) {
        const res = await fetch(`/api/transactions/${ids[0]}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete transaction')
        return res.json()
      }
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Failed to delete transactions')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useResolveFlags() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { flagIds: number[]; resolution: string; newCategoryId?: number }) => {
      const res = await fetch('/api/transactions/flags/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to resolve flags')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
