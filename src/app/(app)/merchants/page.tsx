'use client'

import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RefreshCw, Sparkles, Merge, X, Check, Scissors } from 'lucide-react'
import { SelectionBar } from '@/components/shared/selection-bar'
import { MerchantTable } from '@/components/merchants/merchant-table'
import { MerchantMergeDialog } from '@/components/merchants/merchant-merge-dialog'
import type { MerchantInfo, MergeSuggestion, DescriptionGroup, MerchantTransaction, MerchantSortBy } from '@/types/merchants'
import { useMerchants, useMerchantTransactions, useMerchantMerge, useSuggestMerges, useMerchantSplit } from '@/hooks/use-merchants'

const DEFAULT_ORDERS: Record<MerchantSortBy, 'asc' | 'desc'> = {
  merchant: 'asc',
  transactionCount: 'desc',
  totalAmount: 'desc',
  categoryName: 'asc',
  lastDate: 'desc',
}

function sortMerchants(list: MerchantInfo[], sortBy: MerchantSortBy, sortOrder: 'asc' | 'desc'): MerchantInfo[] {
  return [...list].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'merchant':       cmp = a.merchant.localeCompare(b.merchant); break
      case 'transactionCount': cmp = a.transactionCount - b.transactionCount; break
      case 'totalAmount':    cmp = a.totalAmount - b.totalAmount; break
      case 'categoryName':   cmp = (a.categoryName ?? '').localeCompare(b.categoryName ?? ''); break
      case 'lastDate':       cmp = a.lastDate.localeCompare(b.lastDate); break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
}

export default function MerchantsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<MerchantSortBy>('transactionCount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Level 1: description groups
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [selectedDescriptionGroups, setSelectedDescriptionGroups] = useState<Map<string, DescriptionGroup>>(new Map())

  // Level 2: individual transactions
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set())

  // Split dialog
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [splitName, setSplitName] = useState('')

  const { data: merchants = [], isLoading: loading } = useMerchants(debouncedSearch)
  const { data: groupTransactions = [] } = useMerchantTransactions(expandedMerchant, expandedGroup)
  const merchantMergeMutation = useMerchantMerge()
  const suggestMergesMutation = useSuggestMerges()
  const merchantSplitMutation = useMerchantSplit()

  const suggestingMerges = suggestMergesMutation.isPending
  const splitting = merchantSplitMutation.isPending

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const handleSort = (column: MerchantSortBy) => {
    if (sortBy === column) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(DEFAULT_ORDERS[column])
    }
  }

  const toggleSelect = (merchant: string) => {
    setSelectedMerchants(prev => {
      const next = new Set(prev)
      if (next.has(merchant)) next.delete(merchant)
      else next.add(merchant)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedMerchants.size === merchants.length) {
      setSelectedMerchants(new Set())
    } else {
      setSelectedMerchants(new Set(merchants.map(m => m.merchant)))
    }
  }

  const toggleExpand = (merchant: string) => {
    if (expandedMerchant === merchant) {
      setExpandedMerchant(null)
    } else {
      setExpandedMerchant(merchant)
    }
    setExpandedGroup(null)
    setSelectedDescriptionGroups(new Map())
    setSelectedTransactionIds(new Set())
  }

  const toggleExpandGroup = (description: string) => {
    if (expandedGroup === description) {
      setExpandedGroup(null)
      setSelectedTransactionIds(new Set())
    } else {
      setExpandedGroup(description)
    }
  }

  const toggleTransactionSelect = (id: number) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleDescriptionGroup = (description: string, group: DescriptionGroup) => {
    setSelectedDescriptionGroups(prev => {
      const next = new Map(prev)
      if (next.has(description)) next.delete(description)
      else next.set(description, group)
      return next
    })
  }

  const hasSplitSelection = selectedDescriptionGroups.size > 0 || selectedTransactionIds.size > 0

  const getGroupTransactionIds = async (): Promise<number[]> => {
    if (selectedDescriptionGroups.size === 0) return []
    const ids: number[] = []
    for (const desc of selectedDescriptionGroups.keys()) {
      if (desc === expandedGroup && groupTransactions.length > 0) {
        ids.push(...groupTransactions.map(t => t.id))
      } else {
        const res = await fetch(`/api/merchants/${encodeURIComponent(expandedMerchant!)}?description=${encodeURIComponent(desc)}`)
        const data = await res.json()
        ids.push(...(data.transactions || []).map((t: MerchantTransaction) => t.id))
      }
    }
    return ids
  }

  const handleSplit = async () => {
    try {
      const groupIds = await getGroupTransactionIds()
      const allIds = [...new Set([...groupIds, ...selectedTransactionIds])]
      if (allIds.length === 0) return
      merchantSplitMutation.mutate(
        { transactionIds: allIds, newMerchant: splitName.trim() },
        {
          onSuccess: () => {
            setSplitDialogOpen(false)
            setSplitName('')
            setSelectedDescriptionGroups(new Map())
            setSelectedTransactionIds(new Set())
            setExpandedMerchant(null)
            setExpandedGroup(null)
          },
        }
      )
    } catch { /* ignore */ }
  }

  const handleSuggestMerges = () => {
    suggestMergesMutation.mutate(undefined, {
      onSuccess: (data) => setSuggestions(data),
    })
  }

  const handleApplySuggestion = (suggestion: MergeSuggestion) => {
    merchantMergeMutation.mutate(
      { merchants: suggestion.variants, target: suggestion.canonical },
      { onSuccess: () => setSuggestions(prev => prev.filter(s => s.canonical !== suggestion.canonical)) }
    )
  }

  const handleDismissSuggestion = (suggestion: MergeSuggestion) => {
    setSuggestions(prev => prev.filter(s => s.canonical !== suggestion.canonical))
  }

  const getMerchantCount = (merchantName: string): number => {
    const m = merchants.find(x => x.merchant === merchantName)
    return m?.transactionCount ?? 0
  }

  const sorted = sortMerchants(merchants, sortBy, sortOrder)

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Merchants</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search merchants..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-48 h-8 text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={handleSuggestMerges}
            disabled={suggestingMerges}
          >
            {suggestingMerges ? (
              <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" /> Suggest Merges</>
            )}
          </Button>
        </div>
      </div>

      {/* LLM Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Suggested Merges</p>
          {suggestions.map(suggestion => (
            <Card key={suggestion.canonical} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium mb-1">
                    Merge into <span className="font-semibold">{suggestion.canonical}</span>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {suggestion.variants.map(v => (
                      <Badge key={v} variant="outline" className="text-[11px] px-1.5 py-0">
                        {v}
                        <span className="text-muted-foreground ml-1 tabular-nums">{getMerchantCount(v)}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => handleDismissSuggestion(suggestion)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleApplySuggestion(suggestion)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Apply
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <MerchantTable
        merchants={merchants}
        sorted={sorted}
        loading={loading}
        search={search}
        sortBy={sortBy}
        sortOrder={sortOrder}
        selectedMerchants={selectedMerchants}
        expandedMerchant={expandedMerchant}
        expandedGroup={expandedGroup}
        selectedDescriptionGroups={selectedDescriptionGroups}
        selectedTransactionIds={selectedTransactionIds}
        onSort={handleSort}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onToggleExpand={toggleExpand}
        onToggleDescriptionGroup={toggleDescriptionGroup}
        onToggleExpandGroup={toggleExpandGroup}
        onToggleTransactionSelect={toggleTransactionSelect}
      />

      {/* Sticky selection bar */}
      {hasSplitSelection ? (
        <SelectionBar
          count={selectedDescriptionGroups.size + selectedTransactionIds.size}
          label={[
            selectedDescriptionGroups.size > 0 && `${selectedDescriptionGroups.size} group(s)`,
            selectedTransactionIds.size > 0 && `${selectedTransactionIds.size} transaction(s)`,
          ].filter(Boolean).join(', ') + ' selected'}
          onClear={() => {
            setSelectedDescriptionGroups(new Map())
            setSelectedTransactionIds(new Set())
          }}
        >
          <Button size="sm" className="h-7 text-xs" onClick={() => setSplitDialogOpen(true)}>
            <Scissors className="h-3.5 w-3.5 mr-1" />
            Split
          </Button>
        </SelectionBar>
      ) : (
        <SelectionBar
          count={selectedMerchants.size}
          onClear={() => setSelectedMerchants(new Set())}
        >
          {selectedMerchants.size >= 2 && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setMergeDialogOpen(true)}>
              <Merge className="h-3.5 w-3.5 mr-1" />
              Merge
            </Button>
          )}
        </SelectionBar>
      )}

      {/* Merge Dialog */}
      <MerchantMergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        selectedMerchants={selectedMerchants}
        merchants={merchants}
        onSuccess={() => {
          setMergeDialogOpen(false)
          setSelectedMerchants(new Set())
        }}
      />

      {/* Split Dialog */}
      <Dialog open={splitDialogOpen} onOpenChange={(open) => { setSplitDialogOpen(open); if (!open) setSplitName('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split Merchant</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Enter a new merchant name for the selected transactions.
          </p>
          <Input
            value={splitName}
            onChange={e => setSplitName(e.target.value)}
            placeholder="New merchant name"
            className="h-8 text-sm"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSplitDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={splitting || !splitName.trim()} onClick={handleSplit}>
              {splitting ? 'Splitting...' : 'Split'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
