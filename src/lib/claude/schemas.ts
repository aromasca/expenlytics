import { z } from 'zod'

export const VALID_CATEGORIES = [
  'Groceries', 'Dining', 'Transport', 'Housing', 'Utilities',
  'Entertainment', 'Shopping', 'Health', 'Income', 'Transfer', 'Other',
] as const

export const transactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().positive().describe('Transaction amount as a positive number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
  category: z.string().describe('Spending category, one of: Groceries, Dining, Transport, Housing, Utilities, Entertainment, Shopping, Health, Income, Transfer, Other'),
})

export const extractionSchema = z.object({
  transactions: z.array(transactionSchema),
})

export type ExtractionResult = z.infer<typeof extractionSchema>
export type TransactionData = z.infer<typeof transactionSchema>
