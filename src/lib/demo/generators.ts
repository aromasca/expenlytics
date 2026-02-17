// Deterministic transaction generator for demo dataset

import { DEMO_MERCHANTS, DEMO_ONE_OFFS, type DemoMerchant } from './constants'

export interface DemoTransaction {
  date: string                // YYYY-MM-DD
  description: string
  amount: number
  type: 'debit' | 'credit'
  category: string
  transactionClass: string
  normalizedMerchant: string
  accountIndex: number
}

// Seeded PRNG — mulberry32
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Simple string hash for seeding
function hashStr(s: string): number {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
  }
  return hash
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Seasonal multiplier for variable-frequency merchants
function seasonalMultiplier(month: number, category: string): number {
  // month is 0-indexed (0=Jan)
  const isHoliday = month === 10 || month === 11  // Nov, Dec
  const isSummer = month >= 5 && month <= 7        // Jun-Aug
  const isWinter = month <= 1 || month === 11      // Dec-Feb

  if (category === 'Restaurants' || category === 'Coffee & Cafes') {
    return isHoliday ? 1.2 : 1.0
  }
  if (category === 'Utilities') {
    return (isSummer || isWinter) ? 1.4 : 0.8
  }
  if (category === 'Groceries') {
    return isHoliday ? 1.15 : 1.0
  }
  return 1.0
}

function generateMerchantTransactions(
  merchant: DemoMerchant,
  year: number,
  month: number,  // 0-indexed
): DemoTransaction[] {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

  // Check subscription lifecycle
  if (merchant.startMonth && monthStr < merchant.startMonth) return []
  if (merchant.endMonth && monthStr > merchant.endMonth) return []

  const seed = hashStr(`${merchant.name}-${monthStr}`)
  const rng = mulberry32(seed)
  const transactions: DemoTransaction[] = []
  const days = daysInMonth(year, month)

  const freq = merchant.frequency
  let count: number

  if (freq.type === 'fixed') {
    count = freq.perMonth ?? 1
  } else {
    const min = freq.minPerMonth ?? 1
    const max = freq.maxPerMonth ?? min
    const seasonal = seasonalMultiplier(month, merchant.category)
    const base = min + Math.floor(rng() * (max - min + 1))
    count = Math.round(base * seasonal)
  }

  for (let i = 0; i < count; i++) {
    let day: number
    if (freq.dayOfMonth) {
      day = Math.min(freq.dayOfMonth, days)
    } else if (freq.biweekly) {
      // Biweekly: ~15th and ~last day
      day = i === 0 ? 15 : Math.min(28 + Math.floor(rng() * 3), days)
    } else {
      // Spread across the month with some randomness
      const spread = days / count
      day = Math.max(1, Math.min(days, Math.floor(spread * i + 1 + rng() * spread * 0.8)))
    }

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const descIdx = Math.floor(rng() * merchant.rawDescriptions.length)

    // Amount with slight variation for variable merchants
    let amount: number
    if (merchant.amountMin === merchant.amountMax) {
      amount = merchant.amountMin
    } else {
      const seasonal = seasonalMultiplier(month, merchant.category)
      const base = merchant.amountMin + rng() * (merchant.amountMax - merchant.amountMin)
      amount = Math.round(base * seasonal * 100) / 100
    }

    transactions.push({
      date: dateStr,
      description: merchant.rawDescriptions[descIdx],
      amount,
      type: merchant.type,
      category: merchant.category,
      transactionClass: merchant.transactionClass,
      normalizedMerchant: merchant.name,
      accountIndex: merchant.accountIndex,
    })
  }

  return transactions
}

export function generateDemoTransactions(
  startMonth: string = '2025-01',
  endMonth: string = '2025-12',
): DemoTransaction[] {
  const transactions: DemoTransaction[] = []

  const [startYear, startMo] = startMonth.split('-').map(Number)
  const [endYear, endMo] = endMonth.split('-').map(Number)

  // Iterate each month in range
  let year = startYear
  let month = startMo - 1  // 0-indexed

  while (year < endYear || (year === endYear && month <= endMo - 1)) {
    // Generate transactions for each merchant
    for (const merchant of DEMO_MERCHANTS) {
      const txns = generateMerchantTransactions(merchant, year, month)
      transactions.push(...txns)
    }

    // Next month
    month++
    if (month > 11) {
      month = 0
      year++
    }
  }

  // Add one-off transactions
  for (const oneOff of DEMO_ONE_OFFS) {
    if (oneOff.month >= startMonth && oneOff.month <= endMonth) {
      const [y, m] = oneOff.month.split('-').map(Number)
      const day = Math.min(oneOff.day, daysInMonth(y, m - 1))
      transactions.push({
        date: `${oneOff.month}-${String(day).padStart(2, '0')}`,
        description: oneOff.rawDescription,
        amount: oneOff.amount,
        type: oneOff.type,
        category: oneOff.category,
        transactionClass: oneOff.transactionClass,
        normalizedMerchant: oneOff.name,
        accountIndex: oneOff.accountIndex,
      })
    }
  }

  // Sort by date
  transactions.sort((a, b) => a.date.localeCompare(b.date))
  return transactions
}
