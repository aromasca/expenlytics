'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { RefreshCw, ChevronDown } from 'lucide-react'
import { formatCurrencyPrecise } from '@/lib/format'
import type { DescriptionGroup, MerchantTransaction } from '@/types/merchants'
import { useMerchantGroups, useMerchantTransactions } from '@/hooks/use-merchants'

interface MerchantExpandProps {
  merchant: string
  expandedGroup: string | null
  selectedDescriptionGroups: Map<string, DescriptionGroup>
  selectedTransactionIds: Set<number>
  onToggleDescriptionGroup: (description: string, group: DescriptionGroup) => void
  onToggleExpandGroup: (description: string) => void
  onToggleTransactionSelect: (id: number) => void
}

export function MerchantExpand({
  merchant,
  expandedGroup,
  selectedDescriptionGroups,
  selectedTransactionIds,
  onToggleDescriptionGroup,
  onToggleExpandGroup,
  onToggleTransactionSelect,
}: MerchantExpandProps) {
  const { data: descriptionGroups = [], isLoading: loadingGroups } = useMerchantGroups(merchant)
  const { data: groupTransactions = [], isLoading: loadingTransactions } = useMerchantTransactions(merchant, expandedGroup)

  if (loadingGroups) {
    return (
      <div className="flex justify-center py-3">
        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (descriptionGroups.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No transaction details found.</p>
  }

  return (
    <>
      {descriptionGroups.map((g: DescriptionGroup) => (
        <div key={g.description}>
          <div className="flex items-center gap-3 py-1 text-xs">
            <Checkbox
              checked={selectedDescriptionGroups.has(g.description)}
              onCheckedChange={() => onToggleDescriptionGroup(g.description, g)}
              onClick={e => e.stopPropagation()}
            />
            <span className="font-medium flex-1 min-w-0 truncate">{g.description}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{g.transactionCount} txns</span>
            <span className="tabular-nums shrink-0">{formatCurrencyPrecise(g.totalAmount)}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{g.firstDate} — {g.lastDate}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); onToggleExpandGroup(g.description) }}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedGroup === g.description ? 'rotate-180' : ''}`} />
            </Button>
          </div>
          {expandedGroup === g.description && (
            <div className="ml-6 pl-4 border-l border-border space-y-0.5 py-1">
              {loadingTransactions ? (
                <div className="flex justify-center py-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              ) : groupTransactions.map((t: MerchantTransaction) => (
                <div key={t.id} className="flex items-center gap-3 py-0.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selectedTransactionIds.has(t.id)}
                    onCheckedChange={() => onToggleTransactionSelect(t.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <span className="tabular-nums shrink-0">{t.date}</span>
                  <span className="flex-1 min-w-0 truncate">{t.description}</span>
                  <span className="tabular-nums shrink-0">{formatCurrencyPrecise(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
