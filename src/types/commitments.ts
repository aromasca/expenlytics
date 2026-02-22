export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'yearly' | 'irregular'

export interface CommitmentGroup {
  merchantName: string
  occurrences: number
  totalAmount: number
  avgAmount: number
  estimatedMonthlyAmount: number
  frequency: Frequency
  firstDate: string
  lastDate: string
  category: string | null
  categoryColor: string | null
  transactionIds: number[]
  unexpectedActivity?: boolean
  frequencyOverride?: string | null
  monthlyAmountOverride?: number | null
}

export interface EndedCommitmentGroup extends CommitmentGroup {
  statusChangedAt: string
  unexpectedActivity: boolean
}

export interface CommitmentData {
  activeGroups: CommitmentGroup[]
  endedGroups: EndedCommitmentGroup[]
  excludedMerchants: Array<{ merchant: string; excludedAt: string }>
  summary: {
    activeCount: number
    activeMonthly: number
    endedCount: number
    endedWasMonthly: number
    excludedCount: number
  }
  trendData: Array<{ month: string; amount: number }>
}

export type CommitmentSortBy = 'merchantName' | 'frequency' | 'category' | 'avgAmount' | 'estimatedMonthlyAmount' | 'occurrences' | 'lastDate'
