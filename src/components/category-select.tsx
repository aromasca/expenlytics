'use client'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'

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
  const [open, setOpen] = useState(false)

  const grouped = useMemo(() => {
    const groups = new Map<string, Category[]>()
    for (const cat of categories) {
      const group = cat.category_group || 'Other'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(cat)
    }
    return groups
  }, [categories])

  const selected = categories.find((c) => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[180px] justify-between font-normal"
        >
          {selected ? (
            <span style={{ color: selected.color }}>{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Category</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            {Array.from(grouped.entries()).map(([group, cats]) => (
              <CommandGroup key={group} heading={group}>
                {cats.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.name}
                    onSelect={() => {
                      onValueChange(cat.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === cat.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span style={{ color: cat.color }}>{cat.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
