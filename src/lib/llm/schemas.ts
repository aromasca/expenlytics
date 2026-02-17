import { z } from 'zod'

export const VALID_CATEGORIES = [
  // Food & Drink
  'Groceries', 'Restaurants', 'Coffee & Cafes', 'Fast Food', 'Food Delivery', 'Bars & Alcohol',
  // Transportation
  'Gas & Fuel', 'Public Transit', 'Rideshare & Taxi', 'Parking & Tolls',
  'Car Maintenance', 'Car Payment', 'Car Insurance',
  // Housing
  'Rent & Mortgage', 'Utilities', 'Internet & Phone', 'Home Maintenance',
  'Home Improvement', 'Furniture & Decor', 'Home Insurance',
  // Shopping
  'Clothing & Accessories', 'Electronics', 'Office Supplies', 'Home Goods',
  'Books', 'Sporting Goods', 'General Merchandise',
  // Health & Wellness
  'Health Insurance', 'Medical & Dental', 'Pharmacy', 'Fitness & Gym',
  'Mental Health', 'Vision & Eye Care',
  // Entertainment
  'Movies & Theater', 'Music & Concerts', 'Gaming', 'Streaming Services',
  'Sports & Outdoors', 'Hobbies',
  // Personal
  'Personal Care & Beauty', 'Haircuts & Salon', 'Laundry & Dry Cleaning',
  // Education
  'Tuition & School Fees', 'Books & Supplies', 'Online Courses',
  // Kids & Family
  'Childcare', 'Kids Activities', 'Baby & Kids Supplies',
  // Pets
  'Pet Food & Supplies', 'Veterinary', 'Pet Services',
  // Travel
  'Flights', 'Hotels & Lodging', 'Rental Cars', 'Travel Activities', 'Travel Insurance',
  // Financial
  'Fees & Charges', 'Interest & Finance Charges', 'Taxes', 'Investments', 'Savings',
  // Gifts & Giving
  'Gifts', 'Charitable Donations',
  // Income & Transfers
  'Salary & Wages', 'Freelance Income', 'Refund', 'Transfer', 'ATM Withdrawal',
  // Software & Services
  'AI & Productivity Software', 'SaaS & Subscriptions',
  // Other
  'Other',
] as const

export const VALID_TRANSACTION_CLASSES = [
  'purchase', 'payment', 'refund', 'fee', 'interest', 'transfer',
] as const

export const VALID_DOCUMENT_TYPES = [
  'credit_card', 'checking_account', 'savings_account', 'investment', 'other',
] as const

export const transactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().nonnegative().describe('Transaction amount as a non-negative number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
  category: z.string().describe('Spending category, one of: Groceries, Dining, Transport, Housing, Utilities, Entertainment, Shopping, Health, Income, Transfer, Other'),
  transaction_class: z.enum(VALID_TRANSACTION_CLASSES).describe('Structural classification: purchase, payment, refund, fee, interest, or transfer'),
})

export const extractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  transactions: z.array(transactionSchema),
})

export const rawTransactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().nonnegative().describe('Transaction amount as a non-negative number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
  transaction_class: z.enum(VALID_TRANSACTION_CLASSES).describe('Structural classification: purchase, payment, refund, fee, interest, or transfer'),
})

export const rawExtractionSchema = z.object({
  document_type: z.enum(VALID_DOCUMENT_TYPES).describe('Type of financial document'),
  account_name: z.string().optional().describe('Account name as shown on statement, e.g. "Chase Sapphire Reserve"'),
  institution: z.string().optional().describe('Financial institution name, e.g. "Chase", "Bank of America"'),
  last_four: z.string().optional().describe('Last 4 digits of account number'),
  statement_month: z.string().optional().describe('Billing period month in YYYY-MM format'),
  statement_date: z.string().optional().describe('Exact statement period or closing date as printed on the document'),
  transactions: z.array(rawTransactionSchema),
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

export const classificationSchema = z.object({
  classifications: z.array(z.object({
    index: z.number(),
    category: z.string(),
  })),
})

export type ClassificationResult = z.infer<typeof classificationSchema>

export type ExtractionResult = z.infer<typeof extractionSchema>
export type TransactionData = z.infer<typeof transactionSchema>
export type RawExtractionResult = z.infer<typeof rawExtractionSchema>
export type RawTransactionData = z.infer<typeof rawTransactionSchema>
export type ReclassificationResult = z.infer<typeof reclassificationSchema>
export type NormalizationResult = z.infer<typeof normalizationSchema>

// LLMs sometimes return unexpected enum values — coerce to closest match or default
const sentimentSchema = z.string().transform(v => {
  if (['good', 'neutral', 'bad'].includes(v)) return v as 'good' | 'neutral' | 'bad'
  if (['positive', 'favorable'].includes(v)) return 'good' as const
  if (['negative', 'concerning', 'poor'].includes(v)) return 'bad' as const
  return 'neutral' as const
})

const severitySchema = z.string().transform(v => {
  if (['concerning', 'notable', 'favorable', 'informational'].includes(v)) return v as 'concerning' | 'notable' | 'favorable' | 'informational'
  if (['positive', 'good'].includes(v)) return 'favorable' as const
  if (['negative', 'bad', 'warning'].includes(v)) return 'concerning' as const
  if (['neutral', 'mixed'].includes(v)) return 'notable' as const
  return 'informational' as const
})

// LLMs sometimes return a single string instead of an array — coerce
const stringOrArraySchema = z.union([
  z.array(z.string()),
  z.string().transform(v => [v]),
]).optional()

export const healthAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  color: z.enum(['green', 'yellow', 'red']),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down', 'stable']),
    sentiment: sentimentSchema,
  })),
})

export const insightTypeSchema = z.string().transform((v): 'behavioral_shift' | 'money_leak' | 'projection' | 'commitment_drift' | 'account_anomaly' | 'baseline_gap' => {
  if (['behavioral_shift', 'behavior', 'shift', 'correlation'].includes(v)) return 'behavioral_shift'
  if (['money_leak', 'leak', 'waste', 'subscription'].includes(v)) return 'money_leak'
  if (['projection', 'trend', 'forecast', 'warning'].includes(v)) return 'projection'
  if (['commitment_drift', 'drift', 'price_change', 'commitment'].includes(v)) return 'commitment_drift'
  if (['account_anomaly', 'anomaly', 'account'].includes(v)) return 'account_anomaly'
  if (['baseline_gap', 'baseline', 'gap', 'overrun'].includes(v)) return 'baseline_gap'
  return 'behavioral_shift'
})

export const financialAnalysisSchema = z.object({
  health: healthAssessmentSchema,
  insights: z.array(z.object({
    type: insightTypeSchema,
    headline: z.string(),
    severity: severitySchema,
    explanation: z.string(),
    evidence: z.object({
      merchants: stringOrArraySchema,
      categories: stringOrArraySchema,
      amounts: z.record(z.string(), z.number()).optional(),
      time_period: z.string().optional(),
      accounts: stringOrArraySchema,
      commitment_merchant: z.string().optional(),
    }),
    action: z.string().optional(),
  })),
})

export type FinancialAnalysisResult = z.infer<typeof financialAnalysisSchema>
