export interface Transaction {
  id: number
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category_id: number | null
  category_name: string | null
  category_color: string | null
  transaction_class: string | null
}

export type TransactionSummary = Pick<Transaction, 'id' | 'date' | 'description' | 'amount'>

export interface FlaggedTransaction {
  id: number
  transaction_id: number
  flag_type: 'duplicate' | 'category_mismatch' | 'suspicious'
  details: Record<string, unknown> | null
  date: string
  description: string
  amount: number
  type: string
  document_id: number
  category_name: string | null
  normalized_merchant: string | null
}

export interface MerchantGroup {
  key: string
  label: string
  flagType: 'duplicate' | 'category_mismatch' | 'suspicious'
  flags: FlaggedTransaction[]
  totalAmount: number
  count: number
}
