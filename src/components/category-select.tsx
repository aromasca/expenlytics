'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMemo } from 'react'

interface Category {
  id: number
  name: string
  color: string
  category_group?: string
}

interface CategorySelectProps {
  categories: Category[]
  value: number | null
  onValueChange: (categoryId: number) => void
}

export function CategorySelect({ categories, value, onValueChange }: CategorySelectProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, Category[]>()
    for (const cat of categories) {
      const group = cat.category_group || 'Other'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(cat)
    }
    return groups
  }, [categories])

  return (
    <Select
      value={value?.toString() ?? ''}
      onValueChange={(v) => onValueChange(Number(v))}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {Array.from(grouped.entries()).map(([group, cats]) => (
          <SelectGroup key={group}>
            <SelectLabel className="text-xs text-muted-foreground font-semibold">{group}</SelectLabel>
            {cats.map((cat) => (
              <SelectItem key={cat.id} value={cat.id.toString()}>
                <span style={{ color: cat.color }}>{cat.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
