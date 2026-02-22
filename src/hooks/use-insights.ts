import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InsightsResponse } from '@/types/insights'

export function useInsights() {
  return useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: async () => {
      const res = await fetch('/api/insights')
      if (!res.ok) throw new Error('Failed to fetch insights')
      return res.json()
    },
    refetchInterval: (query) => {
      if (query.state.data?.status === 'generating') return 3000
      return false
    },
  })
}

export function useRegenerateInsights() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/insights', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to regenerate insights')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}

export function useDismissInsight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { insightId: string } | { clearAll: true }) => {
      const isReset = 'clearAll' in body
      const res = await fetch('/api/insights/dismiss', {
        method: isReset ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(!isReset && { body: JSON.stringify(body) }),
      })
      if (!res.ok) throw new Error('Failed to dismiss insight')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}
