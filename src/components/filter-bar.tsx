'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'

interface Category {
  id: number
  name: string
  color: string
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

function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`

  switch (preset) {
    case 'last30': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case 'thisMonth':
      return { start: `${yyyy}-${mm}-01`, end: today }
    case 'last3Months': {
      const d = new Date(yyyy, now.getMonth() - 2, 1)
      return { start: d.toISOString().slice(0, 10), end: today }
    }
    case 'thisYear':
      return { start: `${yyyy}-01-01`, end: today }
    default:
      return { start: '', end: '' }
  }
}

function hasActiveFilters(filters: Filters): boolean {
  return filters.search !== '' || filters.type !== '' || filters.start_date !== '' || filters.end_date !== '' || filters.category_ids.length > 0 || filters.document_id !== ''
}

export { EMPTY_FILTERS, hasActiveFilters }

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [documents, setDocuments] = useState<Document[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories').then(r => r.json()).then(data => {
      if (!cancelled) setCategories(data)
    })
    fetch('/api/documents').then(r => r.json()).then(data => {
      if (!cancelled) setDocuments(data)
    })
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <Input
          placeholder="Search transactions..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="w-56"
        />

        {/* Type */}
        <Select value={filters.type || 'all'} onValueChange={(v) => update({ type: v === 'all' ? '' : v as 'debit' | 'credit' })}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="debit">Debits</SelectItem>
            <SelectItem value="credit">Credits</SelectItem>
          </SelectContent>
        </Select>

        {/* Category multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-44 justify-start">
              {filters.category_ids.length > 0
                ? `${filters.category_ids.length} categories`
                : 'All categories'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 max-h-64 overflow-auto p-2" align="start">
            {categories.map(cat => (
              <label key={cat.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors">
                <Checkbox
                  checked={filters.category_ids.includes(cat.id)}
                  onCheckedChange={() => toggleCategory(cat.id)}
                />
                <span className="text-sm" style={{ color: cat.color }}>{cat.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Source document */}
        <Select value={filters.document_id || 'all'} onValueChange={(v) => update({ document_id: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All files" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All files</SelectItem>
            {documents.map(doc => (
              <SelectItem key={doc.id} value={doc.id.toString()}>{doc.filename}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Date range row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={filters.start_date}
            onChange={(e) => update({ start_date: e.target.value })}
            className="w-36 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={filters.end_date}
            onChange={(e) => update({ end_date: e.target.value })}
            className="w-36 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {[
            { label: 'Last 30d', value: 'last30' },
            { label: 'This month', value: 'thisMonth' },
            { label: 'Last 3mo', value: 'last3Months' },
            { label: 'This year', value: 'thisYear' },
            { label: 'All time', value: 'all' },
          ].map(p => (
            <Button key={p.value} variant="outline" size="sm" onClick={() => {
              if (p.value === 'all') { update({ start_date: '', end_date: '' }) }
              else { applyPreset(p.value) }
            }}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
