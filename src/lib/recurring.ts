export interface TransactionForRecurring {
  id: number
  date: string
  description: string
  normalized_merchant: string | null
  amount: number
  type: 'debit' | 'credit'
  category_name: string | null
  category_color: string | null
}

export interface RecurringGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
}

function detectFrequency(avgDaysBetween: number): RecurringGroup['frequency'] {
  if (avgDaysBetween <= 10) return 'weekly'
  if (avgDaysBetween <= 45) return 'monthly'
  if (avgDaysBetween <= 120) return 'quarterly'
  if (avgDaysBetween <= 400) return 'yearly'
  return 'irregular'
}

function estimateMonthlyAmount(avgAmount: number, frequency: RecurringGroup['frequency']): number {
  switch (frequency) {
    case 'weekly': return avgAmount * (365.25 / 7 / 12)
    case 'monthly': return avgAmount
    case 'quarterly': return avgAmount / 3
    case 'yearly': return avgAmount / 12
    case 'irregular': return avgAmount
  }
}

export function detectRecurringGroups(transactions: TransactionForRecurring[]): RecurringGroup[] {
  const groups = new Map<string, TransactionForRecurring[]>()

  for (const txn of transactions) {
    if (!txn.normalized_merchant) continue
    const key = txn.normalized_merchant
    const existing = groups.get(key) ?? []
    existing.push(txn)
    groups.set(key, existing)
  }

  const result: RecurringGroup[] = []

  for (const [merchantName, txns] of groups) {
    if (txns.length < 2) continue

    txns.sort((a, b) => a.date.localeCompare(b.date))

    // Require at least 2 distinct dates — same-day duplicates aren't recurring
    const distinctDates = new Set(txns.map(t => t.date))
    if (distinctDates.size < 2) continue

    // Require charges to span at least 14 days — same-statement charges aren't recurring
    const firstDate = new Date(txns[0].date)
    const lastDate = new Date(txns[txns.length - 1].date)
    const spanDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
    if (spanDays < 14) continue

    const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0)
    const avgAmount = totalAmount / txns.length

    // Compute avg days between distinct dates for frequency detection
    const sortedDates = [...distinctDates].sort()
    let totalDays = 0
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1])
      const curr = new Date(sortedDates[i])
      totalDays += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    }
    const avgDaysBetween = totalDays / (sortedDates.length - 1)

    const frequency = detectFrequency(avgDaysBetween)

    // Most common category in the group
    const categoryCounts = new Map<string, { count: number; color: string | null }>()
    for (const t of txns) {
      if (t.category_name) {
        const existing = categoryCounts.get(t.category_name)
        if (existing) existing.count++
        else categoryCounts.set(t.category_name, { count: 1, color: t.category_color })
      }
    }
    let topCategory: string | null = null
    let topCategoryColor: string | null = null
    let topCount = 0
    for (const [name, { count, color }] of categoryCounts) {
      if (count > topCount) {
        topCount = count
        topCategory = name
        topCategoryColor = color
      }
    }

    result.push({
      merchantName,
      occurrences: txns.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      avgAmount: Math.round(avgAmount * 100) / 100,
      estimatedMonthlyAmount: Math.round(estimateMonthlyAmount(avgAmount, frequency) * 100) / 100,
      frequency,
      firstDate: txns[0].date,
      lastDate: txns[txns.length - 1].date,
      category: topCategory,
      categoryColor: topCategoryColor,
      transactionIds: txns.map(t => t.id),
    })
  }

  result.sort((a, b) => b.totalAmount - a.totalAmount)
  return result
}
