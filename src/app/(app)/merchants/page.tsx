'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Sparkles, Merge, X, Check, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Scissors } from 'lucide-react'
import { formatCurrencyPrecise } from '@/lib/format'

interface MerchantInfo {
  merchant: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
  categoryName: string | null
  categoryColor: string | null
}

interface MergeSuggestion {
  canonical: string
  variants: string[]
}

interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

type SortBy = 'merchant' | 'transactionCount' | 'totalAmount' | 'categoryName' | 'lastDate'

const DEFAULT_ORDERS: Record<SortBy, 'asc' | 'desc'> = {
  merchant: 'asc',
  transactionCount: 'desc',
  totalAmount: 'desc',
  categoryName: 'asc',
  lastDate: 'desc',
}

function sortMerchants(list: MerchantInfo[], sortBy: SortBy, sortOrder: 'asc' | 'desc'): MerchantInfo[] {
  return [...list].sort((a, b) => {
    let cmp = 0
    switch (sortBy) {
      case 'merchant':
        cmp = a.merchant.localeCompare(b.merchant)
        break
      case 'transactionCount':
        cmp = a.transactionCount - b.transactionCount
        break
      case 'totalAmount':
        cmp = a.totalAmount - b.totalAmount
        break
      case 'categoryName':
        cmp = (a.categoryName ?? '').localeCompare(b.categoryName ?? '')
        break
      case 'lastDate':
        cmp = a.lastDate.localeCompare(b.lastDate)
        break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })
}

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<MerchantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('transactionCount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set())
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [merging, setMerging] = useState(false)
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([])
  const [suggestingMerges, setSuggestingMerges] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Level 1: description groups
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)
  const [descriptionGroups, setDescriptionGroups] = useState<DescriptionGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedDescriptionGroups, setSelectedDescriptionGroups] = useState<Map<string, DescriptionGroup>>(new Map())

  // Level 2: individual transactions
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupTransactions, setGroupTransactions] = useState<MerchantTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set())

  // Split dialog
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [splitName, setSplitName] = useState('')
  const [splitting, setSplitting] = useState(false)

  // Merge preview
  const [mergePreview, setMergePreview] = useState<Record<string, DescriptionGroup[]>>({})
  const [loadingPreview, setLoadingPreview] = useState(false)

  const fetchMerchants = (query?: string) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    fetch(`/api/merchants?${params}`)
      .then(r => r.json())
      .then(d => {
        setMerchants(d.merchants)
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }

  useEffect(() => {
    fetchMerchants()
  }, [])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchMerchants(value || undefined)
    }, 300)
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

  const fetchDescriptionGroups = (merchant: string) => {
    setLoadingGroups(true)
    fetch(`/api/merchants/${encodeURIComponent(merchant)}`)
      .then(r => r.json())
      .then(d => {
        setDescriptionGroups(d.groups || [])
        setLoadingGroups(false)
      })
      .catch(() => { setLoadingGroups(false) })
  }

  const toggleExpand = (merchant: string) => {
    if (expandedMerchant === merchant) {
      setExpandedMerchant(null)
      setDescriptionGroups([])
      setExpandedGroup(null)
      setGroupTransactions([])
      setSelectedDescriptionGroups(new Map())
      setSelectedTransactionIds(new Set())
    } else {
      setExpandedMerchant(merchant)
      setExpandedGroup(null)
      setGroupTransactions([])
      setSelectedDescriptionGroups(new Map())
      setSelectedTransactionIds(new Set())
      fetchDescriptionGroups(merchant)
    }
  }

  const toggleExpandGroup = (description: string) => {
    if (expandedGroup === description) {
      setExpandedGroup(null)
      setGroupTransactions([])
      setSelectedTransactionIds(new Set())
    } else {
      setExpandedGroup(description)
      setLoadingTransactions(true)
      fetch(`/api/merchants/${encodeURIComponent(expandedMerchant!)}?description=${encodeURIComponent(description)}`)
        .then(r => r.json())
        .then(d => {
          setGroupTransactions(d.transactions || [])
          setLoadingTransactions(false)
        })
        .catch(() => { setLoadingTransactions(false) })
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
    setSplitting(true)
    try {
      const groupIds = await getGroupTransactionIds()
      const allIds = [...new Set([...groupIds, ...selectedTransactionIds])]
      if (allIds.length === 0) { setSplitting(false); return }

      const res = await fetch('/api/merchants/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: allIds, newMerchant: splitName.trim() }),
      })
      if (res.ok) {
        setSplitDialogOpen(false)
        setSplitName('')
        setSelectedDescriptionGroups(new Map())
        setSelectedTransactionIds(new Set())
        setExpandedMerchant(null)
        setDescriptionGroups([])
        fetchMerchants(search || undefined)
      }
    } catch { /* ignore */ } finally { setSplitting(false) }
  }

  const openMergeDialog = () => {
    const selected = Array.from(selectedMerchants)
    setMergeTarget(selected[0])
    setCustomTarget('')
    setMergeDialogOpen(true)
    setLoadingPreview(true)
    fetch('/api/merchants/merge-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchants: selected }),
    })
      .then(r => r.json())
      .then(d => { setMergePreview(d.preview || {}); setLoadingPreview(false) })
      .catch(() => { setLoadingPreview(false) })
  }

  const handleMerge = (merchantNames: string[], target: string) => {
    setMerging(true)
    fetch('/api/commitments/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchants: merchantNames, target }),
    })
      .then(r => r.json())
      .then(() => {
        setMerging(false)
        setMergeDialogOpen(false)
        setSelectedMerchants(new Set())
        fetchMerchants(search || undefined)
      })
      .catch(() => { setMerging(false) })
  }

  const handleMergeSubmit = () => {
    const target = mergeTarget === '__custom__' ? customTarget.trim() : mergeTarget
    if (!target) return
    handleMerge(Array.from(selectedMerchants), target)
  }

  const handleSuggestMerges = () => {
    setSuggestingMerges(true)
    fetch('/api/merchants/suggest-merges', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        setSuggestions(d.suggestions || [])
        setSuggestingMerges(false)
      })
      .catch(() => { setSuggestingMerges(false) })
  }

  const handleApplySuggestion = (suggestion: MergeSuggestion) => {
    handleMerge(suggestion.variants, suggestion.canonical)
    setSuggestions(prev => prev.filter(s => s.canonical !== suggestion.canonical))
  }

  const handleDismissSuggestion = (suggestion: MergeSuggestion) => {
    setSuggestions(prev => prev.filter(s => s.canonical !== suggestion.canonical))
  }

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(DEFAULT_ORDERS[column])
    }
  }

  const renderSortIcon = (column: SortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
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
      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : merchants.length === 0 ? (
        <Card className="p-3">
          <p className="text-center text-muted-foreground py-6 text-xs">
            {search ? 'No merchants match your search.' : 'No merchants found.'}
          </p>
        </Card>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedMerchants.size === merchants.length && merchants.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort('merchant')}>
                  <span className="flex items-center">Merchant{renderSortIcon('merchant')}</span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('transactionCount')}>
                  <span className="flex items-center justify-end">Txns{renderSortIcon('transactionCount')}</span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('totalAmount')}>
                  <span className="flex items-center justify-end">Total{renderSortIcon('totalAmount')}</span>
                </TableHead>
                <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort('categoryName')}>
                  <span className="flex items-center">Category{renderSortIcon('categoryName')}</span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('lastDate')}>
                  <span className="flex items-center justify-end">Date Range{renderSortIcon('lastDate')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(m => (
                <React.Fragment key={m.merchant}>
                  <TableRow className="cursor-pointer" onClick={() => toggleExpand(m.merchant)}>
                    <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedMerchants.has(m.merchant)}
                        onCheckedChange={() => toggleSelect(m.merchant)}
                        onClick={e => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="py-1.5 text-xs font-medium">{m.merchant}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums">{m.transactionCount}</TableCell>
                    <TableCell className="py-1.5 text-xs text-right tabular-nums">{formatCurrencyPrecise(m.totalAmount)}</TableCell>
                    <TableCell className="py-1.5">
                      {m.categoryName ? (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-1.5 py-0"
                          style={m.categoryColor ? { borderColor: m.categoryColor, color: m.categoryColor } : undefined}
                        >
                          {m.categoryName}
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-right text-muted-foreground tabular-nums">
                      {m.firstDate} — {m.lastDate}
                    </TableCell>
                  </TableRow>
                  {expandedMerchant === m.merchant && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-0">
                        <div className="bg-muted/30 px-8 py-2 space-y-1">
                          {loadingGroups ? (
                            <div className="flex justify-center py-3">
                              <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                            </div>
                          ) : descriptionGroups.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">No transaction details found.</p>
                          ) : (
                            descriptionGroups.map(g => (
                              <div key={g.description}>
                                <div className="flex items-center gap-3 py-1 text-xs">
                                  <Checkbox
                                    checked={selectedDescriptionGroups.has(g.description)}
                                    onCheckedChange={() => toggleDescriptionGroup(g.description, g)}
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span className="font-medium flex-1 min-w-0 truncate">{g.description}</span>
                                  <span className="text-muted-foreground tabular-nums shrink-0">{g.transactionCount} txns</span>
                                  <span className="tabular-nums shrink-0">{formatCurrencyPrecise(g.totalAmount)}</span>
                                  <span className="text-muted-foreground tabular-nums shrink-0">{g.firstDate} — {g.lastDate}</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 text-muted-foreground"
                                    onClick={(e) => { e.stopPropagation(); toggleExpandGroup(g.description) }}
                                  >
                                    <ChevronDown className={`h-3 w-3 transition-transform ${expandedGroup === g.description ? 'rotate-180' : ''}`} />
                                  </Button>
                                </div>
                                {/* Level 2: individual transactions */}
                                {expandedGroup === g.description && (
                                  <div className="ml-6 pl-4 border-l border-border space-y-0.5 py-1">
                                    {loadingTransactions ? (
                                      <div className="flex justify-center py-2">
                                        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : groupTransactions.map(t => (
                                      <div key={t.id} className="flex items-center gap-3 py-0.5 text-xs text-muted-foreground">
                                        <Checkbox
                                          checked={selectedTransactionIds.has(t.id)}
                                          onCheckedChange={() => toggleTransactionSelect(t.id)}
                                          onClick={e => e.stopPropagation()}
                                        />
                                        <span className="tabular-nums shrink-0">{t.date}</span>
                                        <span className="flex-1 min-w-0 truncate">{t.description}</span>
                                        <span className="tabular-nums shrink-0">{formatCurrencyPrecise(t.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky selection bar */}
      {(selectedMerchants.size >= 1 || hasSplitSelection) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
          {hasSplitSelection ? (
            <>
              <span className="text-xs text-muted-foreground">
                {[
                  selectedDescriptionGroups.size > 0 && `${selectedDescriptionGroups.size} group(s)`,
                  selectedTransactionIds.size > 0 && `${selectedTransactionIds.size} transaction(s)`,
                ].filter(Boolean).join(', ')} selected
              </span>
              <Button size="sm" className="h-7 text-xs" onClick={() => setSplitDialogOpen(true)}>
                <Scissors className="h-3.5 w-3.5 mr-1" />
                Split
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => {
                setSelectedDescriptionGroups(new Map())
                setSelectedTransactionIds(new Set())
              }}>
                Clear
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">{selectedMerchants.size} selected</span>
              {selectedMerchants.size >= 2 && (
                <Button size="sm" className="h-7 text-xs" onClick={openMergeDialog}>
                  <Merge className="h-3.5 w-3.5 mr-1" />
                  Merge
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedMerchants(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Merchants</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Choose which merchant name to keep. All transactions will be updated.
          </p>
          <div className="space-y-1">
            {Array.from(selectedMerchants).map(name => (
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
            <Button variant="ghost" size="sm" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleMergeSubmit} disabled={merging || (mergeTarget === '__custom__' && !customTarget.trim())}>
              {merging ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
