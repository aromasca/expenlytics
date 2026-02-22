import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CommitmentData } from '@/types/commitments'

export function useCommitments(startDate: string, endDate: string) {
  return useQuery<CommitmentData>({
    queryKey: ['commitments', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      const res = await fetch(`/api/commitments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch commitments')
      return res.json()
    },
  })
}

export function useCommitmentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchant: string; status: 'ended' | 'not_recurring' | 'active'; statusDate?: string }) => {
      const res = await fetch('/api/commitments/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update commitment status')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useCommitmentMerge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchants: string[]; target: string }) => {
      const res = await fetch('/api/commitments/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to merge commitments')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}

export function useCommitmentOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { merchant: string; frequencyOverride: string | null; monthlyAmountOverride: number | null }) => {
      const res = await fetch('/api/commitments/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to override commitment')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
    },
  })
}

export function useNormalizeCommitments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/commitments/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      if (!res.ok) throw new Error('Failed to normalize')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['commitments'] })
      queryClient.invalidateQueries({ queryKey: ['merchants'] })
    },
  })
}
