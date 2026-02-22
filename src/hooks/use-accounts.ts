import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AccountData, UnassignedDoc } from '@/types/accounts'

interface AccountsResponse {
  accounts: AccountData[]
  unassigned: UnassignedDoc[]
  needsDetection: UnassignedDoc[]
}

export function useAccounts() {
  return useQuery<AccountsResponse>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('Failed to fetch accounts')
      return res.json()
    },
  })
}

export function useRenameAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to rename account')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useMergeAccounts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (merges: Array<{ sourceId: number; targetId: number }>) => {
      await Promise.all(merges.map(merge =>
        fetch('/api/accounts/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merge),
        }).then(res => { if (!res.ok) throw new Error('Failed to merge accounts') })
      ))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useDetectAccounts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch('/api/accounts/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      })
      if (!res.ok) throw new Error('Failed to detect accounts')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useResetAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (accountId?: number) => {
      const res = await fetch('/api/accounts/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountId !== undefined ? { accountId } : {}),
      })
      if (!res.ok) throw new Error('Failed to reset account')
      return res.json()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
