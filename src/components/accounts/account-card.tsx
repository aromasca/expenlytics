'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Check, Pencil, X } from 'lucide-react'
import { CompletenessGrid } from './completeness-grid'

interface AccountCardProps {
  account: {
    id: number
    name: string
    institution: string | null
    last_four: string | null
    type: string
    documentCount: number
    months: Record<string, { status: 'complete' | 'missing'; documents: Array<{ filename: string; statementDate: string | null }> }>
  }
  selected: boolean
  onSelect: (id: number) => void
  onRename: (id: number, name: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  credit_card: 'Credit Card',
  checking_account: 'Checking',
  savings_account: 'Savings',
  investment: 'Investment',
  other: 'Other',
}

export function AccountCard({ account, selected, onSelect, onRename }: AccountCardProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(account.name)

  const handleSave = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== account.name) {
      onRename(account.id, trimmed)
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setEditName(account.name)
    setEditing(false)
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(account.id)}
            className="h-3.5 w-3.5 rounded border-border shrink-0"
          />
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
                className="h-6 text-xs w-48"
                autoFocus
              />
              <button onClick={handleSave} className="text-muted-foreground hover:text-foreground">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate">{account.name}</span>
              <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground shrink-0">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          {account.last_four && (
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">·{account.last_four}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[11px] font-normal">{TYPE_LABELS[account.type] ?? account.type}</Badge>
          <span className="text-[11px] text-muted-foreground">{account.documentCount} {account.documentCount === 1 ? 'statement' : 'statements'}</span>
        </div>
      </div>
      <CompletenessGrid months={account.months} />
    </Card>
  )
}
