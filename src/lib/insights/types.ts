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

export interface MonthlyFlow {
  month: string
  income: number
  spending: number
  net: number
}

export type InsightType = 'behavioral_shift' | 'money_leak' | 'projection' | 'commitment_drift' | 'account_anomaly' | 'baseline_gap'

export interface Insight {
  id: string
  type: InsightType
  headline: string
  severity: InsightSeverity
  explanation: string
  evidence: {
    merchants?: string[]
    categories?: string[]
    amounts?: Record<string, number>
    time_period?: string
    accounts?: string[]
    commitment_merchant?: string
  }
  action?: string
}

export interface InsightsResponse {
  status: 'ready' | 'generating'
  health: HealthAssessment | null
  monthlyFlow: MonthlyFlow[]
  insights: Insight[]
  dismissedCount: number
  generatedAt: string
}
