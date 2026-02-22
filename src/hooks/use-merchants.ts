import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MerchantInfo, MergeSuggestion, DescriptionGroup, MerchantTransaction } from '@/types/merchants'

export function useMerchants(search: string) {
  return useQuery<MerchantInfo[]>({
    queryKey: ['merchants', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      const res = await fetch(`/api/merchants?${params}`)
      if (!res.ok) throw new Error('Failed to fetch merchants')
      const data = await res.json()
      return data.merchants
    },
  })
}

export function useMerchantGroups(merchant: string | null) {
  return useQuery<DescriptionGroup[]>({
    queryKey: ['merchants', merchant, 'groups'],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${encodeURIComponent(merchant!)}`)
      if (!res.ok) throw new Error('Failed to fetch merchant groups')
      const data = await res.json()
      return data.groups ?? []
    },
    enabled: !!merchant,
  })
}

export function useMerchantTransactions(merchant: string | null, description: string | null) {
  return useQuery<MerchantTransaction[]>({
    queryKey: ['merchants', merchant, 'transactions', description],
    queryFn: async () => {
      const res = await fetch(
        `/api/merchants/${encodeURIComponent(merchant!)}?description=${encodeURIComponent(description!)}`
      )
      if (!res.ok) throw new Error('Failed to fetch merchant transactions')
      const data = await res.json()
      return data.transactions ?? []
    },
    enabled: !!merchant && !!description,
  })
}

export function useMergePreview() {
  return useMutation({
    mutationFn: async (body: { merchants: string[] }): Promise<Record<string, DescriptionGroup[]>> => {
      const res = await fetch('/api/merchants/merge-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to get merge preview')
      const data = await res.json()
      return data.preview ?? {}
    },
  })
}

export function useMerchantMerge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchants: string[]; target: string }) => {
      const res = await fetch('/api/commitments/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to merge merchants')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useSuggestMerges() {
  return useMutation<MergeSuggestion[]>({
    mutationFn: async () => {
      const res = await fetch('/api/merchants/suggest-merges', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to suggest merges')
      const data = await res.json()
      return data.suggestions ?? []
    },
  })
}

export function useMerchantSplit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { transactionIds: number[]; newMerchant: string }) => {
      const res = await fetch('/api/merchants/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to split merchant')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}
