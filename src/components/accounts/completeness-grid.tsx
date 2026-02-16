'use client'

import { cn } from '@/lib/utils'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MonthDocument {
  filename: string
  statementDate: string | null
}

interface MonthStatus {
  status: 'complete' | 'missing'
  documents: MonthDocument[]
}

interface CompletenessGridProps {
  months: Record<string, MonthStatus>
}

export function CompletenessGrid({ months }: CompletenessGridProps) {
  const entries = Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No transaction data yet</p>

  // Group by year
  const byYear = new Map<string, Array<{ month: string; status: 'complete' | 'missing' | 'future'; documents: string[] }>>()
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  for (const [ym, info] of entries) {
    const [year] = ym.split('-')
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({
      month: ym,
      status: ym > currentYM ? 'future' : info.status,
      documents: info.documents,
    })
  }

  return (
    <div className="space-y-2">
      {[...byYear.entries()].map(([year, months]) => {
        const monthNums = months.map(m => parseInt(m.month.split('-')[1], 10))
        const minMonth = Math.min(...monthNums)
        const maxMonth = Math.max(...monthNums)
        const statusMap = new Map(months.map(m => [parseInt(m.month.split('-')[1], 10), m]))

        return (
          <div key={year} className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground w-8 shrink-0 tabular-nums">{year}</span>
            <div className="flex gap-1">
              {Array.from({ length: maxMonth - minMonth + 1 }, (_, i) => {
                const monthNum = minMonth + i
                const entry = statusMap.get(monthNum)
                const status = entry?.status
                const docs = entry?.documents ?? []
                const ym = `${year}-${String(monthNum).padStart(2, '0')}`
                const isFuture = ym > currentYM

                const label = `${MONTH_LABELS[monthNum - 1]} ${year}`
                let tooltip = `${label}: ${isFuture ? 'future' : status ?? 'missing'}`
                for (const doc of docs) {
                  tooltip += `\n${doc.statementDate ?? doc.filename}`
                }

                return (
                  <div
                    key={monthNum}
                    title={tooltip}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <span className="text-[10px] text-muted-foreground leading-none">{MONTH_LABELS[monthNum - 1]}</span>
                    <div
                      className={cn(
                        'h-5 w-5 rounded-sm flex items-center justify-center text-[10px]',
                        isFuture && 'bg-muted text-muted-foreground/40',
                        !isFuture && status === 'complete' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                        !isFuture && status === 'missing' && 'bg-red-500/15 text-red-500 dark:text-red-400',
                        !isFuture && !status && 'bg-muted text-muted-foreground/40',
                      )}
                    >
                      {isFuture ? '·' : status === 'complete' ? '✓' : status === 'missing' ? '✗' : '·'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
