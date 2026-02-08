export type InsightSeverity = 'concerning' | 'notable' | 'favorable' | 'informational'
export type InsightType = 'category_trend' | 'lifestyle_inflation' | 'recurring_charges' | 'spending_shift' | 'llm_insight'

export interface SparklinePoint {
  label: string
  value: number
}

export interface InsightCard {
  id: string
  type: InsightType
  severity: InsightSeverity
  headline: string
  metric: string
  percentChange: number
  dollarChange: number
  score: number
  sparkline: SparklinePoint[]
  detail?: InsightDetail
}

export interface InsightTransaction {
  date: string
  description: string
  amount: number
  category: string | null
}

export interface InsightDetail {
  breakdown: Array<{ label: string; current: number; previous: number }>
  periodLabel: string
  explanation: string
  transactions: InsightTransaction[]
}

export interface InsightsResponse {
  hero: InsightCard[]
  categoryTrends: InsightCard[]
  lifestyleInflation: InsightCard[]
  recurringCharges: InsightCard[]
  spendingShifts: InsightCard[]
  llmInsights: InsightCard[]
  dismissedCount: number
  generatedAt: string
}
