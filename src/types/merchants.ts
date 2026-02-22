export interface MerchantInfo {
  merchant: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
  categoryName: string | null
  categoryColor: string | null
}

export interface MergeSuggestion {
  canonical: string
  variants: string[]
}

export interface DescriptionGroup {
  description: string
  transactionCount: number
  totalAmount: number
  firstDate: string
  lastDate: string
}

export interface MerchantTransaction {
  id: number
  date: string
  description: string
  amount: number
}

export type MerchantSortBy = 'merchant' | 'transactionCount' | 'totalAmount' | 'categoryName' | 'lastDate'
