'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Category {
  id: number
  name: string
  color: string
}

interface CategorySelectProps {
  categories: Category[]
  value: number | null
  onValueChange: (categoryId: number) => void
}

export function CategorySelect({ categories, value, onValueChange }: CategorySelectProps) {
  return (
    <Select
      value={value?.toString() ?? ''}
      onValueChange={(v) => onValueChange(Number(v))}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder="Category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((cat) => (
          <SelectItem key={cat.id} value={cat.id.toString()}>
            <span style={{ color: cat.color }}>{cat.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
