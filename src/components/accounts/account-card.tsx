'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
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

  const monthEntries = Object.values(account.months)
  const totalMonths = monthEntries.length
  const completeMonths = monthEntries.filter(m => m.status === 'complete').length
  const completionPct = totalMonths > 0 ? Math.round((completeMonths / totalMonths) * 100) : 0

  return (
    <div className="group py-2.5 px-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(account.id)}
          className="h-3.5 w-3.5 rounded border-border shrink-0 opacity-0 group-hover:opacity-100 transition-opacity checked:opacity-100"
        />

        {/* Account identity */}
        <div className="flex items-center gap-1.5 min-w-0 w-56 shrink-0">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
                className="h-6 text-xs w-44"
                autoFocus
              />
              <button onClick={handleSave} className="text-muted-foreground hover:text-foreground">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-medium truncate">{account.name}</span>
              {account.last_four && (
                <span className="text-[11px] text-muted-foreground/70 tabular-nums shrink-0">·{account.last_four}</span>
              )}
              <button onClick={() => setEditing(true)} className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground transition-colors shrink-0">
                <Pencil className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>

        {/* Type badge */}
        <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5 shrink-0">
          {TYPE_LABELS[account.type] ?? account.type}
        </Badge>

        {/* Completeness grid — fills remaining space */}
        <div className="flex-1 min-w-0">
          <CompletenessGrid months={account.months} />
        </div>

        {/* Completion stat */}
        <div className="text-right shrink-0 w-16">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {completeMonths}/{totalMonths}
          </span>
          <div className="h-1 w-full bg-muted rounded-full mt-0.5 overflow-hidden">
            <div
              className="h-full bg-emerald-500/60 rounded-full transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
