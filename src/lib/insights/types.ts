export type InsightSeverity = 'concerning' | 'notable' | 'favorable' | 'informational'

export interface HealthMetric {
  label: string
  value: string
  trend: 'up' | 'down' | 'stable'
  sentiment: 'good' | 'neutral' | 'bad'
}

export interface HealthAssessment {
  score: number
  summary: string
  color: 'green' | 'yellow' | 'red'
  metrics: HealthMetric[]
}

export interface PatternCard {
  id: string
  headline: string
  metric: string
  explanation: string
  category: 'timing' | 'merchant' | 'behavioral' | 'subscription' | 'correlation'
  severity: InsightSeverity
  evidence: {
    merchants?: string[]
    categories?: string[]
    time_period?: string
  }
}

export interface DeepInsight {
  id: string
  headline: string
  severity: InsightSeverity
  key_metric: string
  explanation: string
  action_suggestion?: string
  evidence: {
    category_a?: string
    category_b?: string
    merchant_names?: string[]
  }
}

export interface MonthlyFlow {
  month: string
  income: number
  spending: number
  net: number
}

export interface InsightsResponse {
  status: 'ready' | 'generating'
  health: HealthAssessment | null
  monthlyFlow: MonthlyFlow[]
  patterns: PatternCard[]
  insights: DeepInsight[]
  dismissedCount: number
  generatedAt: string
}
