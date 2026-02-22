'use client'

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'

interface SortableHeaderProps<T extends string> {
  column: T
  label: string
  currentSort: T
  currentOrder: 'asc' | 'desc'
  onSort: (column: T) => void
  className?: string
}

export function SortableHeader<T extends string>({
  column,
  label,
  currentSort,
  currentOrder,
  onSort,
  className,
}: SortableHeaderProps<T>) {
  const isActive = currentSort === column
  return (
    <TableHead
      className={`cursor-pointer select-none ${className ?? ''}`}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  )
}
