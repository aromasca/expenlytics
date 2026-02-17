export interface TransactionForCommitment {
  id: number
  date: string
  description: string
  normalized_merchant: string | null
  amount: number
  type: 'debit' | 'credit'
  category_name: string | null
  category_color: string | null
}

export interface CommitmentGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'yearly' | 'irregular'
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
  frequencyOverride?: CommitmentGroup['frequency'] | null
  monthlyAmountOverride?: number | null
  _transactionData?: Array<{ date: string; amount: number }>
}

function detectFrequency(avgDaysBetween: number): CommitmentGroup['frequency'] {
  if (avgDaysBetween <= 10) return 'weekly'
  if (avgDaysBetween <= 45) return 'monthly'
  if (avgDaysBetween <= 120) return 'quarterly'
  if (avgDaysBetween <= 240) return 'semi-annual'
  if (avgDaysBetween <= 400) return 'yearly'
  return 'irregular'
}

export function estimateMonthlyAmount(
  frequency: CommitmentGroup['frequency'],
  transactions: { date: string; amount: number }[]
): number {
  // For infrequent charges, amortize across the period
  if (frequency === 'quarterly' || frequency === 'semi-annual' || frequency === 'yearly') {
    const avgAmount = transactions.reduce((s, t) => s + t.amount, 0) / transactions.length
    const divisor = frequency === 'quarterly' ? 3 : frequency === 'semi-annual' ? 6 : 12
    return avgAmount / divisor
  }

  const totalAmount = transactions.reduce((s, t) => s + t.amount, 0)
  const first = new Date(transactions[0].date)
  const last = new Date(transactions[transactions.length - 1].date)
  // Inclusive calendar-month span: Jan 2025 → Jan 2026 = 13, not 12.
  // Math.round(days / 30.44) underestimates on month-end boundaries.
  const firstYM = first.getFullYear() * 12 + first.getMonth()
  const lastYM = last.getFullYear() * 12 + last.getMonth()
  const spanMonths = lastYM - firstYM + 1

  // For weekly/monthly: use min(count, span).
  // - Billing drift (Jan 30 → Mar 2): count ≈ span, min picks count → correct avg per charge
  // - Multi-charge per month (gym $50 + $20): count >> span, min picks span → correct monthly total
  if (frequency === 'weekly' || frequency === 'monthly') {
    return totalAmount / Math.max(1, Math.min(transactions.length, spanMonths))
  }

  // For irregular: use max of distinct months and span (can't rely on count)
  const distinctMonths = new Set(transactions.map(t => t.date.slice(0, 7))).size
  return totalAmount / Math.max(1, distinctMonths, spanMonths)
}

export function detectCommitmentGroups(transactions: TransactionForCommitment[]): CommitmentGroup[] {
  // Group case-insensitively, keeping the most common casing as the display name
  const groups = new Map<string, TransactionForCommitment[]>()

  for (const txn of transactions) {
    if (!txn.normalized_merchant) continue
    const key = txn.normalized_merchant.toLowerCase()
    const existing = groups.get(key) ?? []
    existing.push(txn)
    groups.set(key, existing)
  }

  const result: CommitmentGroup[] = []

  for (const [, txns] of groups) {
    // Pick the most common casing as display name
    const nameCounts = new Map<string, number>()
    for (const t of txns) {
      const n = t.normalized_merchant!
      nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1)
    }
    let merchantName = txns[0].normalized_merchant!
    let maxCount = 0
    for (const [name, count] of nameCounts) {
      if (count > maxCount) { maxCount = count; merchantName = name }
    }
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

    // Require 3+ occurrences for most frequencies, but allow 2 for semi-annual/yearly (150+ day span)
    if (txns.length < 3 && spanDays < 150) continue

    const totalAmount = txns.reduce((sum, t) => sum + t.amount, 0)
    const avgAmount = totalAmount / txns.length

    // Compute median days between distinct dates for frequency detection
    // Median is robust against a single missing month inflating the average
    const sortedDates = [...distinctDates].sort()
    const gaps: number[] = []
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1])
      const curr = new Date(sortedDates[i])
      gaps.push((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
    }
    gaps.sort((a, b) => a - b)
    const mid = Math.floor(gaps.length / 2)
    const avgDaysBetween = gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2

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
      estimatedMonthlyAmount: Math.round(estimateMonthlyAmount(frequency, txns) * 100) / 100,
      frequency,
      firstDate: txns[0].date,
      lastDate: txns[txns.length - 1].date,
      category: topCategory,
      categoryColor: topCategoryColor,
      transactionIds: txns.map(t => t.id),
      _transactionData: txns.map(t => ({ date: t.date, amount: t.amount })),
    })
  }

  result.sort((a, b) => b.totalAmount - a.totalAmount)
  return result
}

export function applyCommitmentOverrides(
  groups: CommitmentGroup[],
  overrides: Map<string, { frequencyOverride: CommitmentGroup['frequency'] | null; monthlyAmountOverride: number | null }>
): void {
  for (const g of groups) {
    const override = overrides.get(g.merchantName)
    if (!override) continue
    if (override.frequencyOverride) {
      g.frequency = override.frequencyOverride
      g.frequencyOverride = override.frequencyOverride
      // Recalculate monthly amount with new frequency unless monthly is also overridden
      if (override.monthlyAmountOverride == null && g._transactionData) {
        g.estimatedMonthlyAmount = Math.round(estimateMonthlyAmount(override.frequencyOverride, g._transactionData) * 100) / 100
      }
    }
    if (override.monthlyAmountOverride != null) {
      g.estimatedMonthlyAmount = override.monthlyAmountOverride
      g.monthlyAmountOverride = override.monthlyAmountOverride
    }
  }
}
