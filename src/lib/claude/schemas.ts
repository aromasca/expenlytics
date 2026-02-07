import { z } from 'zod'

export const VALID_CATEGORIES = [
  'Groceries', 'Restaurants & Dining', 'Gas & Fuel', 'Public Transit',
  'Rideshare & Taxi', 'Parking & Tolls', 'Rent & Mortgage', 'Home Maintenance',
  'Utilities', 'Subscriptions', 'Shopping', 'Electronics', 'Health & Medical',
  'Fitness', 'Insurance', 'Childcare & Education', 'Pets', 'Travel',
  'Entertainment', 'Gifts & Donations', 'Personal Care', 'Income', 'Transfer',
  'Refund', 'Fees & Charges', 'Other',
] as const

export const VALID_DOCUMENT_TYPES = [
  'credit_card', 'checking_account', 'savings_account', 'investment', 'other',
] as const

export const transactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().positive().describe('Transaction amount as a positive number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
  category: z.string().describe('Spending category, one of: Groceries, Dining, Transport, Housing, Utilities, Entertainment, Shopping, Health, Income, Transfer, Other'),
})

export const extractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  transactions: z.array(transactionSchema),
})

export const reclassificationSchema = z.object({
  classifications: z.array(z.object({
    id: z.number(),
    category: z.string(),
  })),
})

export const normalizationSchema = z.object({
  normalizations: z.array(z.object({
    description: z.string(),
    merchant: z.string(),
  })),
})

export type ExtractionResult = z.infer<typeof extractionSchema>
export type TransactionData = z.infer<typeof transactionSchema>
export type ReclassificationResult = z.infer<typeof reclassificationSchema>
export type NormalizationResult = z.infer<typeof normalizationSchema>
