'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X, Undo2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AreaChart, Area, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrencyPrecise } from '@/lib/format'
import { useTheme } from '@/components/theme-provider'
import { getChartColors } from '@/lib/chart-theme'

interface Transaction {
  id: number
  date: string
  description: string
  amount: number
}

interface CommitmentRowDetailProps {
  transactionIds: number[]
}

function MiniTooltip({ active, payload, isDark }: { active?: boolean; payload?: Array<{ payload: { date: string; amount: number } }>; isDark: boolean }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const [y, m] = d.date.split('-')
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]
  return (
    <div
      className="rounded border px-2 py-1 shadow-sm"
      style={{
        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
        borderColor: isDark ? '#3F3F46' : '#E5E5E5',
      }}
    >
      <p className="text-[10px] text-muted-foreground">{month} {y}</p>
      <p className="text-xs font-semibold tabular-nums" style={{ color: isDark ? '#FAFAFA' : '#0A0A0A' }}>
        {formatCurrencyPrecise(d.amount)}
      </p>
    </div>
  )
}

export function CommitmentRowDetail({ transactionIds }: CommitmentRowDetailProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    if (transactionIds.length === 0) { setTimeout(() => setLoading(false), 0); return }
    fetch(`/api/transactions?ids=${transactionIds.join(',')}`)
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [transactionIds])

  const handleExclude = (id: number) => {
    setExcludedIds(prev => new Set(prev).add(id))
    fetch('/api/commitments/exclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: id }),
    }).catch(() => {
      setExcludedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    })
  }

  const handleRestore = (id: number) => {
    setExcludedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    fetch('/api/commitments/exclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: id, restore: true }),
    }).catch(() => {
      setExcludedIds(prev => new Set(prev).add(id))
    })
  }

  if (loading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">Loading...</div>
  }

  const activeTransactions = transactions.filter(t => !excludedIds.has(t.id))
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  const chartData = [...activeTransactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({ date: t.date, amount: t.amount }))

  const amounts = chartData.map(d => d.amount)
  const avg = amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0
  const min = amounts.length > 0 ? Math.min(...amounts) : 0
  const max = amounts.length > 0 ? Math.max(...amounts) : 0
  const latest = amounts.length > 0 ? amounts[amounts.length - 1] : 0
  const prev = amounts.length >= 2 ? amounts[amounts.length - 2] : latest
  const change = latest - prev

  const colors = getChartColors(isDark)

  return (
    <div className="grid grid-cols-[1fr_280px] gap-4 px-4 py-3 bg-muted/30">
      <div className="max-h-48 overflow-y-auto pr-2">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="py-1 text-[11px]">Date</TableHead>
              <TableHead className="py-1 text-[11px]">Description</TableHead>
              <TableHead className="py-1 text-[11px] text-right">Amount</TableHead>
              <TableHead className="py-1 w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(t => {
              const isExcluded = excludedIds.has(t.id)
              return (
                <TableRow key={t.id} className={isExcluded ? 'opacity-30' : ''}>
                  <TableCell className="py-1 text-[11px] tabular-nums text-muted-foreground">{t.date}</TableCell>
                  <TableCell className={`py-1 text-[11px] truncate max-w-[200px]${isExcluded ? ' line-through' : ''}`}>{t.description}</TableCell>
                  <TableCell className="py-1 text-[11px] text-right tabular-nums">{formatCurrencyPrecise(t.amount)}</TableCell>
                  <TableCell className="py-1">
                    {isExcluded ? (
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground opacity-100" title="Restore to group" onClick={() => handleRestore(t.id)}>
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground" title="Remove from group" onClick={() => handleExclude(t.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground">Cost Trend</span>
          {change !== 0 && amounts.length >= 2 && (
            <span className={`text-[11px] font-medium tabular-nums ${change > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {change > 0 ? '+' : ''}{formatCurrencyPrecise(change)}
            </span>
          )}
        </div>
        {chartData.length >= 2 ? (
          <>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="miniGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={colors.stroke} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <ReferenceLine y={avg} stroke={colors.text} strokeDasharray="3 3" strokeOpacity={0.5} />
                <Tooltip
                  content={<MiniTooltip isDark={isDark} />}
                  cursor={{ stroke: colors.text, strokeDasharray: '3 3', strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={colors.stroke}
                  fill="url(#miniGradient)"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: colors.dotFill, stroke: colors.stroke, strokeWidth: 1.5 }}
                  activeDot={{ r: 4, fill: colors.stroke, stroke: colors.dotFill, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-between mt-1 px-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">Avg {formatCurrencyPrecise(avg)}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{formatCurrencyPrecise(min)} – {formatCurrencyPrecise(max)}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[100px]">
            <span className="text-[11px] text-muted-foreground">Not enough data</span>
          </div>
        )}
      </div>
    </div>
  )
}
