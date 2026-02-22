import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ProviderEntry {
  name: string
  envKey: string
  models: { id: string; name: string }[]
  defaults: Record<string, string>
}

interface SettingsResponse {
  providers: Record<string, ProviderEntry>
  availableProviders: string[]
  [key: string]: unknown
}

export function useSettings() {
  return useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json()
    },
  })
}

export function useUpdateSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { key: string; value: string }) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to update setting')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useDemoMode() {
  return useQuery<{ demo: boolean; hasData: boolean }>({
    queryKey: ['demo'],
    queryFn: async () => {
      const res = await fetch('/api/demo')
      if (!res.ok) throw new Error('Failed to fetch demo status')
      return res.json()
    },
  })
}

export function useToggleDemo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (action: 'load' | 'clear') => {
      const res = await fetch('/api/demo', { method: action === 'load' ? 'POST' : 'DELETE' })
      if (!res.ok) throw new Error('Failed to toggle demo mode')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['demo'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useResetApp() {
  return useMutation({
    mutationFn: async (body: { confirmPhrase: string }) => {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to reset')
      return res.json()
    },
  })
}
