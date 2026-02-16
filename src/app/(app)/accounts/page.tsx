'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface AccountData {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  documentCount: number
  months: Record<string, { status: 'complete' | 'missing'; documents: Array<{ filename: string; statementDate: string | null }> }>
}

interface UnassignedDoc {
  id: number
  filename: string
  document_type: string | null
  status: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountData[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedDoc[]>([])
  const [needsDetection, setNeedsDetection] = useState<UnassignedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<number | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [detectProgress, setDetectProgress] = useState({ current: 0, total: 0, lastAccount: '' })

  const fetchAccounts = useCallback(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.accounts)
        setUnassigned(data.unassigned)
        setNeedsDetection(data.needsDetection ?? data.unassigned)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const handleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRename = (id: number, name: string) => {
    fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(() => fetchAccounts())
      .catch(() => {})
  }

  const handleMerge = () => {
    if (!mergeTarget || selected.size < 2) return
    const sources = [...selected].filter(id => id !== mergeTarget)
    Promise.all(
      sources.map(sourceId =>
        fetch('/api/accounts/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceId, targetId: mergeTarget }),
        })
      )
    )
      .then(() => {
        setSelected(new Set())
        setMergeOpen(false)
        setMergeTarget(null)
        fetchAccounts()
      })
      .catch(() => {})
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
      ) : (
        <div className="space-y-2">
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
      )}

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
                    const res = await fetch('/api/accounts/detect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ documentId: docs[i].id }),
                    })
                    const data = await res.json()
                    setDetectProgress({
                      current: i + 1,
                      total: docs.length,
                      lastAccount: data.accountName ?? '',
                    })
                  } catch {
                    // Skip failures, continue with next
                  }

                  // Refresh after each doc so the UI updates progressively
                  fetchAccounts()
                }

                fetchAccounts()
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
                fetch('/api/accounts/reset', { method: 'POST' })
                  .then(() => {
                    setSelected(new Set())
                    setResetOpen(false)
                    fetchAccounts()
                  })
                  .catch(() => {})
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
