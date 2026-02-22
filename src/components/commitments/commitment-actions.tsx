'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SelectionBar } from '@/components/shared/selection-bar'
import { Merge, Ban, StopCircle } from 'lucide-react'
import { useCommitmentMerge } from '@/hooks/use-commitments'

interface CommitmentActionsProps {
  selectedMerchants: Set<string>
  onClearSelection: () => void
  onBulkEnd: (merchants: string[]) => void
  onBulkExclude: (merchants: string[]) => void
}

export function CommitmentActions({
  selectedMerchants,
  onClearSelection,
  onBulkEnd,
  onBulkExclude,
}: CommitmentActionsProps) {
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')

  const commitmentMerge = useCommitmentMerge()

  const openMergeDialog = () => {
    const merchants = Array.from(selectedMerchants)
    setMergeTarget(merchants[0])
    setCustomTarget('')
    setMergeDialogOpen(true)
  }

  const handleMerge = () => {
    const target = mergeTarget === '__custom__' ? customTarget.trim() : mergeTarget
    if (!target) return
    commitmentMerge.mutate(
      { merchants: Array.from(selectedMerchants), target },
      {
        onSuccess: () => {
          setMergeDialogOpen(false)
          onClearSelection()
        },
      }
    )
  }

  return (
    <>
      <SelectionBar count={selectedMerchants.size} onClear={onClearSelection}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => {
            onBulkEnd(Array.from(selectedMerchants))
            onClearSelection()
          }}
        >
          <StopCircle className="h-3.5 w-3.5 mr-1" />
          End
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => {
            onBulkExclude(Array.from(selectedMerchants))
            onClearSelection()
          }}
        >
          <Ban className="h-3.5 w-3.5 mr-1" />
          Exclude
        </Button>
        {selectedMerchants.size >= 2 && (
          <Button size="sm" className="h-7 text-xs" onClick={openMergeDialog}>
            <Merge className="h-3.5 w-3.5 mr-1" />
            Merge
          </Button>
        )}
      </SelectionBar>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Merchants</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Choose which merchant name to keep.
          </p>
          <div className="space-y-1">
            {Array.from(selectedMerchants).map(name => (
              <label key={name} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
                <input
                  type="radio"
                  name="mergeTarget"
                  value={name}
                  checked={mergeTarget === name}
                  onChange={() => setMergeTarget(name)}
                />
                {name}
              </label>
            ))}
            <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
              <input
                type="radio"
                name="mergeTarget"
                value="__custom__"
                checked={mergeTarget === '__custom__'}
                onChange={() => setMergeTarget('__custom__')}
              />
              Custom name
            </label>
            {mergeTarget === '__custom__' && (
              <Input
                value={customTarget}
                onChange={e => setCustomTarget(e.target.value)}
                placeholder="Merchant name"
                className="ml-6 h-8 text-sm"
                autoFocus
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMergeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleMerge}
              disabled={commitmentMerge.isPending || (mergeTarget === '__custom__' && !customTarget.trim())}
            >
              {commitmentMerge.isPending ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
