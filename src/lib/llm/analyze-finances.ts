import type { LLMProvider, ProviderName } from './types'
import { getFinancialAnalysisPrompt } from './prompts/insights'
import { financialAnalysisSchema } from './schemas'
import type { CompactFinancialData } from '@/lib/insights/compact-data'
import type { HealthAssessment, Insight } from '@/lib/insights/types'

function stripCodeFences(text: string): string {
  return text.trim().replace(/^`{3,}(?:json)?\s*\n?/, '').replace(/\n?`{3,}\s*$/, '')
}

export async function analyzeFinances(
  provider: LLMProvider,
  providerName: ProviderName,
  data: CompactFinancialData,
  model: string
): Promise<{ health: HealthAssessment; insights: Insight[] }> {
  const prompt = getFinancialAnalysisPrompt(providerName)

  // Build context line
  const months = data.monthly.map(m => m.month)
  const dateRange = months.length > 0 ? `${months[0]} to ${months[months.length - 1]}` : 'no data'
  const txnCount = data.recent_transactions.length

  // Separate sections from aggregated data
  const { recent_transactions, merchant_month_deltas, active_commitments, commitment_baseline, account_summaries, ...aggregated } = data

  const filledPrompt = prompt.user
    .replace('{date_range}', dateRange)
    .replace('{txn_count}', String(txnCount))
    .replace('{data_json}', JSON.stringify(aggregated))
    .replace('{recent_txns_json}', JSON.stringify(recent_transactions))
    .replace('{merchant_deltas_json}', JSON.stringify(merchant_month_deltas))
    .replace('{account_summaries_json}', JSON.stringify(account_summaries))
    .replace('{active_commitments_json}', JSON.stringify(active_commitments))
    .replace('__baseline_total__', String(commitment_baseline.total_monthly))
    .replace('__baseline_count__', String(commitment_baseline.count))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const parsed = JSON.parse(stripCodeFences(response.text))
  const result = financialAnalysisSchema.parse(parsed)

  return {
    health: result.health,
    insights: result.insights.map((insight, i) => ({
      id: `llm-insight-${i}`,
      ...insight,
    })),
  }
}
