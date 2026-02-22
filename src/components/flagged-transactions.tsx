'use client'

import { useState, useEffect, useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { CategorySelect } from './category-select'
import { formatCurrencyPrecise } from '@/lib/format'
import { AlertTriangle, Copy, Tag, ChevronDown, ChevronRight } from 'lucide-react'

interface FlaggedTransaction {
  id: number
  transaction_id: number
  flag_type: 'duplicate' | 'category_mismatch' | 'suspicious'
  details: Record<string, unknown> | null
  date: string
  description: string
  amount: number
  type: string
  document_id: number
  category_name: string | null
  normalized_merchant: string | null
}

interface Category {
  id: number
  name: string
  color: string
}

interface MerchantGroup {
  key: string
  label: string
  flagType: 'duplicate' | 'category_mismatch' | 'suspicious'
  flags: FlaggedTransaction[]
  totalAmount: number
  count: number
}

interface FlaggedTransactionsProps {
  onResolve?: (count: number) => void
}

function groupFlags(flags: FlaggedTransaction[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>()

  for (const flag of flags) {
    // Group by: flag_type + normalized_merchant (or description if no merchant)
    const merchant = flag.normalized_merchant || flag.description
    const key = `${flag.flag_type}:${merchant.toLowerCase()}`

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: merchant,
        flagType: flag.flag_type,
        flags: [],
        totalAmount: 0,
        count: 0,
      })
    }
    const group = groups.get(key)!
    group.flags.push(flag)
    group.totalAmount += flag.amount
    group.count++
  }

  // Sort groups by total amount descending
  return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount)
}

const FLAG_ICON = {
  duplicate: Copy,
  category_mismatch: Tag,
  suspicious: AlertTriangle,
} as const

const FLAG_LABEL = {
  duplicate: 'Duplicate',
  category_mismatch: 'Category',
  suspicious: 'Suspicious',
} as const

export function FlaggedTransactions({ onResolve }: FlaggedTransactionsProps) {
  const [flags, setFlags] = useState<FlaggedTransaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/transactions?flagged=true')
      .then(r => r.json())
      .then(data => {
        setTimeout(() => {
          setFlags(data.transactions)
          setLoading(false)
        }, 0)
      })
      .catch(() => setTimeout(() => setLoading(false), 0))
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => setTimeout(() => setCategories(data), 0))
      .catch(() => {})
  }, [refreshKey])

  const groups = useMemo(() => groupFlags(flags), [flags])

  const resolveMany = (flagIds: number[], resolution: string, categoryId?: number) => {
    const count = flagIds.length
    // Optimistic removal
    setFlags(prev => prev.filter(f => !flagIds.includes(f.id)))
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of flagIds) next.delete(id)
      return next
    })
    onResolve?.(count)

    fetch('/api/transactions/flags/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagIds, resolution, categoryId }),
    }).catch(() => {
      setRefreshKey(k => k + 1)
    })
  }

  const resolve = (flagId: number, resolution: string, categoryId?: number) => {
    resolveMany([flagId], resolution, categoryId)
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleGroupSelect = (group: MerchantGroup) => {
    const groupIds = group.flags.map(f => f.id)
    const allSelected = groupIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of groupIds) next.delete(id)
      } else {
        for (const id of groupIds) next.add(id)
      }
      return next
    })
  }

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-6 text-center">Loading flagged transactions...</div>
  }

  if (flags.length === 0) {
    return <div className="text-xs text-muted-foreground py-6 text-center">No flagged transactions. Looking good!</div>
  }

  const selectedFlags = flags.filter(f => selected.has(f.id))
  // For bulk actions, check if all selected are the same flag type
  const selectedTypes = new Set(selectedFlags.map(f => f.flag_type))
  const uniformType = selectedTypes.size === 1 ? [...selectedTypes][0] : null

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-1.5 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-1">
            {(uniformType === 'duplicate' || !uniformType) && (
              <>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive" onClick={() => resolveMany([...selected], 'removed')}>
                  Remove all
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => resolveMany([...selected], 'kept')}>
                  Keep all
                </Button>
              </>
            )}
            {uniformType === 'category_mismatch' && (
              <>
                {(() => {
                  // If all share the same suggested_category, offer one-click fix
                  const suggestions = selectedFlags.map(f => (f.details as Record<string, string>)?.suggested_category).filter(Boolean)
                  const uniqueSuggestions = [...new Set(suggestions)]
                  if (uniqueSuggestions.length === 1) {
                    const cat = categories.find(c => c.name === uniqueSuggestions[0])
                    return cat ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] text-emerald-600 dark:text-emerald-400"
                        onClick={() => resolveMany([...selected], 'fixed', cat.id)}>
                        Fix all to: {uniqueSuggestions[0]}
                      </Button>
                    ) : null
                  }
                  return (
                    <CategorySelect categories={categories} value={null} placeholder="Fix all to..."
                      onValueChange={(catId) => resolveMany([...selected], 'fixed', catId)} />
                  )
                })()}
              </>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={() => resolveMany([...selected], 'dismissed')}>
              Dismiss all
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground ml-auto" onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 py-2"></TableHead>
            <TableHead className="w-8 py-2"></TableHead>
            <TableHead className="py-2 text-xs">Merchant / Description</TableHead>
            <TableHead className="py-2 text-xs text-right">Amount</TableHead>
            <TableHead className="py-2 text-xs text-center">Count</TableHead>
            <TableHead className="py-2 text-xs">Issue</TableHead>
            <TableHead className="py-2 text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const isExpanded = expanded.has(group.key)
            const groupIds = group.flags.map(f => f.id)
            const allGroupSelected = groupIds.every(id => selected.has(id))
            const someGroupSelected = groupIds.some(id => selected.has(id))
            const Icon = FLAG_ICON[group.flagType]

            return (
              <GroupRows
                key={group.key}
                group={group}
                isExpanded={isExpanded}
                allGroupSelected={allGroupSelected}
                someGroupSelected={someGroupSelected}
                Icon={Icon}
                categories={categories}
                selected={selected}
                onToggleExpand={() => toggleExpand(group.key)}
                onToggleGroupSelect={() => toggleGroupSelect(group)}
                onToggleSelect={toggleSelect}
                onResolve={resolve}
                onResolveMany={resolveMany}
              />
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

interface GroupRowsProps {
  group: MerchantGroup
  isExpanded: boolean
  allGroupSelected: boolean
  someGroupSelected: boolean
  Icon: typeof Copy
  categories: Category[]
  selected: Set<number>
  onToggleExpand: () => void
  onToggleGroupSelect: () => void
  onToggleSelect: (id: number) => void
  onResolve: (flagId: number, resolution: string, categoryId?: number) => void
  onResolveMany: (flagIds: number[], resolution: string, categoryId?: number) => void
}

function GroupRows({
  group, isExpanded, allGroupSelected, someGroupSelected, Icon,
  categories, selected,
  onToggleExpand, onToggleGroupSelect, onToggleSelect, onResolve, onResolveMany,
}: GroupRowsProps) {
  const groupIds = group.flags.map(f => f.id)

  return (
    <>
      {/* Group header row */}
      <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={onToggleExpand}>
        <TableCell className="py-1.5 w-8">
          <Checkbox
            checked={allGroupSelected}
            ref={(el) => {
              if (el) {
                const input = el as unknown as HTMLButtonElement
                input.dataset.indeterminate = String(someGroupSelected && !allGroupSelected)
              }
            }}
            onCheckedChange={() => onToggleGroupSelect()}
            onClick={(e) => e.stopPropagation()}
          />
        </TableCell>
        <TableCell className="py-1.5 w-8">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="py-1.5 text-xs font-medium">{group.label}</TableCell>
        <TableCell className="py-1.5 text-xs text-right tabular-nums font-medium">
          {formatCurrencyPrecise(group.totalAmount)}
        </TableCell>
        <TableCell className="py-1.5 text-xs text-center tabular-nums">
          <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">{group.count}</Badge>
        </TableCell>
        <TableCell className="py-1.5">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Icon className="h-2.5 w-2.5" />
            {FLAG_LABEL[group.flagType]}
          </Badge>
        </TableCell>
        <TableCell className="py-1.5">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {group.flagType === 'duplicate' && (
              <>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive" onClick={() => onResolveMany(groupIds, 'removed')}>
                  Remove all
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => onResolveMany(groupIds, 'kept')}>
                  Keep all
                </Button>
              </>
            )}
            {group.flagType === 'category_mismatch' && (
              <>
                {(() => {
                  const suggestions = group.flags.map(f => (f.details as Record<string, string>)?.suggested_category).filter(Boolean)
                  const unique = [...new Set(suggestions)]
                  if (unique.length === 1) {
                    const cat = categories.find(c => c.name === unique[0])
                    return cat ? (
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] text-emerald-600 dark:text-emerald-400"
                        onClick={() => onResolveMany(groupIds, 'fixed', cat.id)}>
                        Fix all to: {unique[0]}
                      </Button>
                    ) : null
                  }
                  return null
                })()}
              </>
            )}
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" onClick={() => onResolveMany(groupIds, 'dismissed')}>
              Dismiss all
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded individual rows */}
      {isExpanded && group.flags
        .sort((a, b) => b.amount - a.amount)
        .map((flag) => (
        <TableRow key={flag.id} className={`${selected.has(flag.id) ? 'bg-muted/50' : ''}`}>
          <TableCell className="py-1 pl-6">
            <Checkbox
              checked={selected.has(flag.id)}
              onCheckedChange={() => onToggleSelect(flag.id)}
            />
          </TableCell>
          <TableCell className="py-1"></TableCell>
          <TableCell className="py-1 text-xs text-muted-foreground pl-4">
            <span className="tabular-nums mr-2">{flag.date}</span>
            {flag.description}
          </TableCell>
          <TableCell className={`py-1 text-xs text-right tabular-nums ${flag.type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
            {flag.type === 'credit' ? '+' : '-'}{formatCurrencyPrecise(flag.amount)}
          </TableCell>
          <TableCell className="py-1 text-[10px] text-center text-muted-foreground">
            doc #{flag.document_id}
          </TableCell>
          <TableCell className="py-1 text-[10px] text-muted-foreground">
            {flag.flag_type === 'duplicate' && `dup of doc #${(flag.details as Record<string, number>)?.duplicate_of_doc}`}
            {flag.flag_type === 'category_mismatch' && (flag.category_name ?? 'Uncategorized')}
          </TableCell>
          <TableCell className="py-1">
            <div className="flex items-center gap-1">
              {flag.flag_type === 'duplicate' && (
                <>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] text-destructive" onClick={() => onResolve(flag.id, 'removed')}>
                    Remove
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => onResolve(flag.id, 'kept')}>
                    Keep
                  </Button>
                </>
              )}
              {flag.flag_type === 'category_mismatch' && (
                (flag.details as Record<string, string>)?.suggested_category ? (
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] text-emerald-600 dark:text-emerald-400"
                    onClick={() => {
                      const cat = categories.find(c => c.name === (flag.details as Record<string, string>).suggested_category)
                      if (cat) onResolve(flag.id, 'fixed', cat.id)
                    }}>
                    Fix: {(flag.details as Record<string, string>).suggested_category}
                  </Button>
                ) : (
                  <CategorySelect categories={categories} value={null} placeholder="Fix..."
                    onValueChange={(catId) => onResolve(flag.id, 'fixed', catId)} />
                )
              )}
              <Button variant="ghost" size="sm" className="h-5 text-[10px] text-muted-foreground" onClick={() => onResolve(flag.id, 'dismissed')}>
                Dismiss
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
