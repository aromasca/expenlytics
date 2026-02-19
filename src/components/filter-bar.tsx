'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'
import { getDatePreset } from '@/lib/date-presets'

interface Category {
  id: number
  name: string
  color: string
  category_group?: string
}

interface Document {
  id: number
  filename: string
}

export interface Filters {
  search: string
  type: '' | 'debit' | 'credit'
  start_date: string
  end_date: string
  category_ids: number[]
  document_id: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  start_date: '',
  end_date: '',
  category_ids: [],
  document_id: '',
}

interface FilterBarProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

function hasActiveFilters(filters: Filters): boolean {
  return filters.search !== '' || filters.type !== '' || filters.start_date !== '' || filters.end_date !== '' || filters.category_ids.length > 0 || filters.document_id !== ''
}

export { EMPTY_FILTERS, hasActiveFilters }

function CategoryFilterPopover({ categories, selectedIds, onToggle }: { categories: Category[]; selectedIds: number[]; onToggle: (id: number) => void }) {
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const groups = new Map<string, Category[]>()
    for (const cat of categories) {
      const g = cat.category_group || 'Other'
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(cat)
    }
    return groups
  }, [categories])

  const filtered = useMemo(() => {
    if (!search) return grouped
    const q = search.toLowerCase()
    const result = new Map<string, Category[]>()
    for (const [group, cats] of grouped) {
      const matching = cats.filter(c => c.name.toLowerCase().includes(q))
      if (matching.length > 0) result.set(group, matching)
    }
    return result
  }, [grouped, search])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs justify-start w-36">
          {selectedIds.length > 0
            ? `${selectedIds.length} categories`
            : 'All categories'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-1.5 h-7 text-xs"
        />
        <div className="max-h-56 overflow-auto">
          {Array.from(filtered.entries()).map(([group, cats]) => (
            <div key={group}>
              <div className="text-[11px] text-muted-foreground font-medium px-2 pt-2 pb-0.5 uppercase tracking-wider">{group}</div>
              {cats.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent cursor-pointer transition-colors">
                  <Checkbox
                    checked={selectedIds.includes(cat.id)}
                    onCheckedChange={() => onToggle(cat.id)}
                  />
                  <span className="text-xs" style={{ color: cat.color }}>{cat.name}</span>
                </label>
              ))}
            </div>
          ))}
          {filtered.size === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">No results</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [documents, setDocuments] = useState<Document[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    }).catch(() => {})
    fetch('/api/documents').then(r => r.json()).then(data => {
      if (!cancelled) setDocuments(data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial })
  }

  const applyPreset = (preset: string) => {
    const { start, end } = getDatePreset(preset)
    update({ start_date: start, end_date: end })
  }

  const toggleCategory = (id: number) => {
    const ids = filters.category_ids.includes(id)
      ? filters.category_ids.filter(c => c !== id)
      : [...filters.category_ids, id]
    update({ category_ids: ids })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search..."
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
        className="w-48 h-8 text-xs"
      />

      <Select value={filters.type || 'all'} onValueChange={(v) => update({ type: v === 'all' ? '' : v as 'debit' | 'credit' })}>
        <SelectTrigger className="w-24 h-8 text-xs">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="debit">Debits</SelectItem>
          <SelectItem value="credit">Credits</SelectItem>
        </SelectContent>
      </Select>

      <CategoryFilterPopover
        categories={categories}
        selectedIds={filters.category_ids}
        onToggle={toggleCategory}
      />

      <Select value={filters.document_id || 'all'} onValueChange={(v) => update({ document_id: v === 'all' ? '' : v })}>
        <SelectTrigger className="w-36 h-8 text-xs">
          <SelectValue placeholder="All files" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All files</SelectItem>
          {documents.map(doc => (
            <SelectItem key={doc.id} value={doc.id.toString()}>{doc.filename}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">From</span>
        <Input type="date" value={filters.start_date} onChange={(e) => update({ start_date: e.target.value })} className="w-32 h-8 text-xs" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-muted-foreground">To</span>
        <Input type="date" value={filters.end_date} onChange={(e) => update({ end_date: e.target.value })} className="w-32 h-8 text-xs" />
      </div>

      <div className="flex gap-0.5">
        {[
          { label: '30d', value: 'last30' },
          { label: 'Mo', value: 'thisMonth' },
          { label: '3mo', value: 'last3Months' },
          { label: 'YTD', value: 'thisYear' },
          { label: 'All', value: 'all' },
        ].map(p => (
          <Button key={p.value} variant="ghost" size="sm" className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => {
            if (p.value === 'all') { update({ start_date: '', end_date: '' }) }
            else { applyPreset(p.value) }
          }}>
            {p.label}
          </Button>
        ))}
      </div>

      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
          <X className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}
