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

export const rawTransactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Merchant name or transaction description'),
  amount: z.number().positive().describe('Transaction amount as a positive number'),
  type: z.enum(['debit', 'credit']).describe('debit for money out, credit for money in'),
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

export const healthAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  color: z.enum(['green', 'yellow', 'red']),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down', 'stable']),
    sentiment: z.enum(['good', 'neutral', 'bad']),
  })),
})

export const patternCardSchema = z.object({
  id: z.string(),
  headline: z.string(),
  metric: z.string(),
  explanation: z.string(),
  category: z.enum(['timing', 'merchant', 'behavioral', 'subscription', 'correlation']),
  severity: z.enum(['concerning', 'notable', 'favorable', 'informational']),
  evidence: z.object({
    merchants: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
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
    severity: z.enum(['concerning', 'notable', 'favorable', 'informational']),
    key_metric: z.string(),
    explanation: z.string(),
    action_suggestion: z.string().optional(),
    evidence: z.object({
      category_a: z.string().optional(),
      category_b: z.string().optional(),
      merchant_names: z.array(z.string()).optional(),
    }),
  })),
})

export type HealthAndPatternsResult = z.infer<typeof healthAndPatternsSchema>
export type DeepInsightResult = z.infer<typeof deepInsightSchema>
