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
  if (entries.length === 0) return <span className="text-[11px] text-muted-foreground/50">No data</span>

  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Group by year
  const byYear = new Map<string, Array<{ month: string; monthNum: number; status: 'complete' | 'missing' | 'future'; documents: MonthDocument[] }>>()

  for (const [ym, info] of entries) {
    const [year, m] = ym.split('-')
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push({
      month: ym,
      monthNum: parseInt(m, 10),
      status: ym > currentYM ? 'future' : info.status,
      documents: info.documents,
    })
  }

  return (
    <div className="flex items-center gap-3">
      {[...byYear.entries()].map(([year, yearMonths]) => {
        const monthNums = yearMonths.map(m => m.monthNum)
        const minMonth = Math.min(...monthNums)
        const maxMonth = Math.max(...monthNums)
        const statusMap = new Map(yearMonths.map(m => [m.monthNum, m]))

        return (
          <div key={year} className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground/50 tabular-nums mr-0.5">{year}</span>
            <div className="flex gap-[3px]">
              {Array.from({ length: maxMonth - minMonth + 1 }, (_, i) => {
                const monthNum = minMonth + i
                const entry = statusMap.get(monthNum)
                const status = entry?.status
                const docs = entry?.documents ?? []
                const ym = `${year}-${String(monthNum).padStart(2, '0')}`
                const isFuture = ym > currentYM

                const label = `${MONTH_LABELS[monthNum - 1]} ${year}`
                let tooltip = label
                if (isFuture) {
                  tooltip += ' (upcoming)'
                } else if (status === 'complete') {
                  tooltip += ' — uploaded'
                  for (const doc of docs) {
                    tooltip += `\n  ${doc.statementDate ?? doc.filename}`
                  }
                } else {
                  tooltip += ' — missing'
                }

                return (
                  <div
                    key={monthNum}
                    title={tooltip}
                    className={cn(
                      'h-4 w-4 rounded-[3px] text-[9px] font-medium flex items-center justify-center cursor-default transition-colors',
                      isFuture && 'bg-muted/60 text-transparent',
                      !isFuture && status === 'complete' && 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                      !isFuture && status === 'missing' && 'bg-red-500/10 text-red-400/80 dark:text-red-400/60',
                      !isFuture && !status && 'bg-muted/60 text-transparent',
                    )}
                  >
                    {MONTH_LABELS[monthNum - 1]?.[0]}
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
