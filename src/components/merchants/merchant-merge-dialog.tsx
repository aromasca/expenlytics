'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RefreshCw } from 'lucide-react'
import { formatCurrencyPrecise } from '@/lib/format'
import type { MerchantInfo } from '@/types/merchants'
import { useMergePreview, useMerchantMerge } from '@/hooks/use-merchants'

interface MerchantMergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedMerchants: Set<string>
  merchants: MerchantInfo[]
  onSuccess: () => void
}

export function MerchantMergeDialog({
  open,
  onOpenChange,
  selectedMerchants,
  merchants,
  onSuccess,
}: MerchantMergeDialogProps) {
  const selected = Array.from(selectedMerchants)
  const [mergeTarget, setMergeTarget] = useState(selected[0] ?? '')
  const [customTarget, setCustomTarget] = useState('')

  const mergePreviewMutation = useMergePreview()
  const merchantMergeMutation = useMerchantMerge()

  const mergePreview = mergePreviewMutation.data ?? {}
  const loadingPreview = mergePreviewMutation.isPending
  const merging = merchantMergeMutation.isPending

  // When the dialog opens, initialize target and trigger preview
  useEffect(() => {
    if (open && selected.length > 0) {
      setMergeTarget(selected[0])
      setCustomTarget('')
      mergePreviewMutation.mutate({ merchants: selected })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const getMerchantCount = (merchantName: string): number => {
    const m = merchants.find(x => x.merchant === merchantName)
    return m?.transactionCount ?? 0
  }

  const handleSubmit = () => {
    const target = mergeTarget === '__custom__' ? customTarget.trim() : mergeTarget
    if (!target) return
    merchantMergeMutation.mutate(
      { merchants: selected, target },
      { onSuccess }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge Merchants</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">
          Choose which merchant name to keep. All transactions will be updated.
        </p>
        <div className="space-y-1">
          {selected.map(name => (
            <label key={name} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
              <input type="radio" name="mergeTarget" value={name} checked={mergeTarget === name} onChange={() => setMergeTarget(name)} />
              {name}
              <span className="text-muted-foreground text-xs tabular-nums ml-auto">{getMerchantCount(name)} txns</span>
            </label>
          ))}
          <label className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm">
            <input type="radio" name="mergeTarget" value="__custom__" checked={mergeTarget === '__custom__'} onChange={() => setMergeTarget('__custom__')} />
            Custom name
          </label>
          {mergeTarget === '__custom__' && (
            <Input value={customTarget} onChange={e => setCustomTarget(e.target.value)} placeholder="Merchant name" className="ml-6 h-8 text-sm" autoFocus />
          )}
        </div>
        {!loadingPreview && Object.keys(mergePreview).length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Transaction patterns being merged</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {Object.entries(mergePreview).map(([merchant, groups]) => (
                <div key={merchant}>
                  <p className="text-xs font-medium mb-0.5">{merchant}</p>
                  {groups.map(g => (
                    <div key={g.description} className="flex items-center gap-2 text-[11px] text-muted-foreground pl-3">
                      <span className="flex-1 truncate">{g.description}</span>
                      <span className="tabular-nums shrink-0">{g.transactionCount} txns</span>
                      <span className="tabular-nums shrink-0">{formatCurrencyPrecise(g.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {loadingPreview && (
          <div className="mt-3 flex justify-center py-2">
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={merging || (mergeTarget === '__custom__' && !customTarget.trim())}>
            {merging ? 'Merging...' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
