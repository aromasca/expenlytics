import type { InsightCard, InsightSeverity } from './types'

export function scoreRecency(daysAgo: number): number {
  if (daysAgo <= 30) return 40
  if (daysAgo <= 60) return 30
  if (daysAgo <= 90) return 20
  return 10
}

export function scoreMagnitude(percentChange: number, dollarChange: number): number {
  const absPct = Math.abs(percentChange)
  let pctScore = 5
  if (absPct > 50) pctScore = 20
  else if (absPct > 25) pctScore = 15
  else if (absPct > 10) pctScore = 10

  const absDollar = Math.abs(dollarChange)
  let dollarScore = 5
  if (absDollar > 500) dollarScore = 20
  else if (absDollar > 200) dollarScore = 15
  else if (absDollar > 50) dollarScore = 10

  return pctScore + dollarScore
}

export function scoreSeverity(severity: InsightSeverity): number {
  switch (severity) {
    case 'concerning': return 20
    case 'notable': return 15
    case 'informational': return 10
    case 'favorable': return 5
  }
}

export function scoreInsight(insight: InsightCard, daysAgo: number): number {
  return scoreRecency(daysAgo) + scoreMagnitude(insight.percentChange, insight.dollarChange) + scoreSeverity(insight.severity)
}

export function rankInsights(insights: InsightCard[]): InsightCard[] {
  return [...insights]
    .filter(i => i.score > 30)
    .sort((a, b) => b.score - a.score)
}
