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

export const llmInsightSchema = z.object({
  insights: z.array(z.object({
    headline: z.string(),
    category: z.string(),
    severity: z.enum(['concerning', 'notable', 'favorable', 'informational']),
    key_metric: z.string(),
    explanation: z.string(),
    evidence: z.object({
      category_a: z.string().optional(),
      category_b: z.string().optional(),
      merchant_names: z.array(z.string()).optional(),
    }),
    action_suggestion: z.string().optional(),
  })),
})

export type ClassificationResult = z.infer<typeof classificationSchema>
export type LLMInsightData = z.infer<typeof llmInsightSchema>

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

export const patternCardSchema = z.object({
  id: z.string(),
  headline: z.string(),
  metric: z.string(),
  explanation: z.string(),
  category: z.string().transform((v): 'timing' | 'merchant' | 'behavioral' | 'subscription' | 'correlation' => {
    if (['timing', 'merchant', 'behavioral', 'subscription', 'correlation'].includes(v)) return v as 'timing' | 'merchant' | 'behavioral' | 'subscription' | 'correlation'
    return 'behavioral'
  }),
  severity: severitySchema,
  evidence: z.object({
    merchants: stringOrArraySchema,
    categories: stringOrArraySchema,
    time_period: z.string().optional(),
  }),
})

export const healthAndPatternsSchema = z.object({
  health: healthAssessmentSchema,
  patterns: z.array(patternCardSchema),
})

export const deepInsightSchema = z.object({
  insights: z.array(z.object({
    headline: z.string(),
    severity: severitySchema,
    key_metric: z.string(),
    explanation: z.string(),
    action_suggestion: z.string().optional(),
    evidence: z.object({
      category_a: z.string().optional(),
      category_b: z.string().optional(),
      merchant_names: z.union([
        z.array(z.string()),
        z.string().transform(v => [v]),
      ]).optional(),
    }),
  })),
})

export type HealthAndPatternsResult = z.infer<typeof healthAndPatternsSchema>
export type DeepInsightResult = z.infer<typeof deepInsightSchema>
