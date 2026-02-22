'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface SelectionBarProps {
  count: number
  label?: string
  onClear: () => void
  children: React.ReactNode
  /** 'floating' — fixed pill at bottom center (merchants/commitments).
   *  'inline'   — inline muted bar above a table (transactions). */
  variant?: 'floating' | 'inline'
}

export function SelectionBar({
  count,
  label,
  onClear,
  children,
  variant = 'floating',
}: SelectionBarProps) {
  if (count === 0) return null

  const displayLabel = label ?? `${count} selected`

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-1.5 text-xs">
        <span className="font-medium">{displayLabel}</span>
        {children}
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
          Cancel
        </Button>
      </div>
    )
  }

  // floating variant
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
      <span className="text-xs text-muted-foreground">{displayLabel}</span>
      {children}
      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> Clear
      </Button>
    </div>
  )
}
