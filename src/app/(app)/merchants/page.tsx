'use client'

import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, Sparkles, Merge, X, Check, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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

  const openMergeDialog = () => {
    const selected = Array.from(selectedMerchants)
    setMergeTarget(selected[0])
    setCustomTarget('')
    setMergeDialogOpen(true)
  }

  const handleMerge = (merchantNames: string[], target: string) => {
    setMerging(true)
    fetch('/api/recurring/merge', {
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

  const SortIcon = ({ column }: { column: SortBy }) => {
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
                  <span className="flex items-center">Merchant<SortIcon column="merchant" /></span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('transactionCount')}>
                  <span className="flex items-center justify-end">Txns<SortIcon column="transactionCount" /></span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('totalAmount')}>
                  <span className="flex items-center justify-end">Total<SortIcon column="totalAmount" /></span>
                </TableHead>
                <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort('categoryName')}>
                  <span className="flex items-center">Category<SortIcon column="categoryName" /></span>
                </TableHead>
                <TableHead className="text-xs text-right cursor-pointer select-none" onClick={() => handleSort('lastDate')}>
                  <span className="flex items-center justify-end">Date Range<SortIcon column="lastDate" /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(m => (
                <TableRow key={m.merchant} className="cursor-pointer" onClick={() => toggleSelect(m.merchant)}>
                  <TableCell className="py-1.5">
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky selection bar */}
      {selectedMerchants.size >= 1 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
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
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMergeDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleMergeSubmit} disabled={merging || (mergeTarget === '__custom__' && !customTarget.trim())}>
              {merging ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
