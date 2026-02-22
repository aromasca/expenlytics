'use client'

import { useState } from 'react'
import { AccountCard } from '@/components/accounts/account-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAccounts, useRenameAccount, useMergeAccounts, useDetectAccounts, useResetAccount } from '@/hooks/use-accounts'

export default function AccountsPage() {
  const { data: accountsData, isLoading: loading } = useAccounts()
  const renameAccount = useRenameAccount()
  const mergeAccounts = useMergeAccounts()
  const detectAccounts = useDetectAccounts()
  const resetAccount = useResetAccount()

  const accounts = accountsData?.accounts ?? []
  const unassigned = accountsData?.unassigned ?? []
  const needsDetection = accountsData?.needsDetection ?? []

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<number | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [detectProgress, setDetectProgress] = useState({ current: 0, total: 0, lastAccount: '' })

  const handleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRename = (id: number, name: string) => {
    renameAccount.mutate({ id, name })
  }

  const handleMerge = () => {
    if (!mergeTarget || selected.size < 2) return
    const sources = [...selected].filter(id => id !== mergeTarget)
    mergeAccounts.mutate(
      sources.map(sourceId => ({ sourceId, targetId: mergeTarget })),
      {
        onSuccess: () => {
          setSelected(new Set())
          setMergeOpen(false)
          setMergeTarget(null)
        },
      }
    )
  }

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <p className="text-xs text-muted-foreground mt-4">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <div className="flex items-center gap-1">
          {selected.size >= 2 && (
            <Button variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setMergeOpen(true)}>
              Merge {selected.size} accounts
            </Button>
          )}
          {accounts.length > 0 && !detecting && (
            <Button
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setResetOpen(true)}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {accounts.length === 0 && unassigned.length === 0 ? (
        <p className="text-xs text-muted-foreground">No accounts detected yet. Upload bank statements to get started.</p>
      ) : accounts.length > 0 ? (
        <div className="border border-border/50 rounded-lg divide-y divide-border/50 overflow-hidden">
          {accounts.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              selected={selected.has(account.id)}
              onSelect={handleSelect}
              onRename={handleRename}
            />
          ))}
        </div>
      ) : null}

      {needsDetection.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground">
              {unassigned.length > 0
                ? `Unassigned Documents (${unassigned.length})`
                : `${needsDetection.length} documents need re-detection`}
            </h2>
            <Button
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              disabled={detecting}
              onClick={async () => {
                setDetecting(true)
                const docs = [...needsDetection]
                setDetectProgress({ current: 0, total: docs.length, lastAccount: '' })

                for (let i = 0; i < docs.length; i++) {
                  try {
                    const result = await detectAccounts.mutateAsync(docs[i].id)
                    setDetectProgress({
                      current: i + 1,
                      total: docs.length,
                      lastAccount: result.accountName ?? '',
                    })
                  } catch {
                    // Skip failures, continue with next
                    setDetectProgress(prev => ({ ...prev, current: i + 1 }))
                  }
                }

                setDetecting(false)
              }}
            >
              {detecting
                ? `Detecting ${detectProgress.current}/${detectProgress.total}...`
                : 'Detect Accounts'}
            </Button>
          </div>
          {detecting && detectProgress.lastAccount && (
            <p className="text-[11px] text-muted-foreground">
              Last detected: {detectProgress.lastAccount}
            </p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            {unassigned.map(doc => (
              <div key={doc.id} className="flex items-center gap-2 py-1">
                <span className="truncate">{doc.filename}</span>
                <span className="text-[11px] text-muted-foreground/60">{doc.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Accounts</DialogTitle>
            <DialogDescription>
              Select the target account. All documents from the other selected accounts will be moved to it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {accounts.filter(a => selected.has(a.id)).map(a => (
              <label key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted cursor-pointer text-sm">
                <input
                  type="radio"
                  name="merge-target"
                  checked={mergeTarget === a.id}
                  onChange={() => setMergeTarget(a.id)}
                  className="h-3.5 w-3.5"
                />
                {a.name}
                {a.last_four && <span className="text-muted-foreground text-[11px]">·{a.last_four}</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-7 text-xs" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button className="h-7 text-xs" disabled={!mergeTarget} onClick={handleMerge}>Merge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Account Detection</DialogTitle>
            <DialogDescription>
              This will delete all detected accounts and unlink every document. Use this when detection produced incorrect results and you want to start fresh.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            All {accounts.length} accounts and their month assignments will be removed. Your documents and transactions are not affected — you can re-run detection afterward.
          </p>
          <DialogFooter>
            <Button variant="ghost" className="h-7 text-xs" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="h-7 text-xs"
              onClick={() => {
                resetAccount.mutate(undefined, {
                  onSuccess: () => {
                    setSelected(new Set())
                    setResetOpen(false)
                  },
                })
              }}
            >
              Reset All Accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
