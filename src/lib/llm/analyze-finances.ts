import type { LLMProvider, ProviderName } from './types'
import { getHealthAndPatternsPrompt, getDeepInsightsPrompt } from './prompts/insights'
import { healthAndPatternsSchema, deepInsightSchema, type HealthAndPatternsResult } from './schemas'
import type { CompactFinancialData } from '@/lib/insights/compact-data'
import type { HealthAssessment, DeepInsight } from '@/lib/insights/types'

function buildSummaryStats(data: CompactFinancialData): string {
  const totalIncome = data.monthly.reduce((s, m) => s + m.income, 0)
  const totalSpending = data.monthly.reduce((s, m) => s + m.spending, 0)
  const months = data.monthly.length
  const topMerchants = data.merchants.slice(0, 10).map(m =>
    `  - ${m.name}: $${m.total.toFixed(2)} total, ${m.count} transactions, $${m.avg} avg`
  ).join('\n')
  const topCategories = data.categories.slice(0, 10).map(c => {
    const total = Object.values(c.amounts).reduce((s, v) => s + v, 0)
    return `  - ${c.category}: $${total.toFixed(2)} total`
  }).join('\n')

  return [
    `Total income (${months} months): $${totalIncome.toFixed(2)}`,
    `Total spending (${months} months): $${totalSpending.toFixed(2)}`,
    `Avg monthly income: $${(totalIncome / months).toFixed(2)}`,
    `Avg monthly spending: $${(totalSpending / months).toFixed(2)}`,
    `Top merchants by frequency:`,
    topMerchants,
    `Top categories by spend:`,
    topCategories,
    `Total merchants in data: ${data.merchants.length}`,
    `Total recurring charges: ${data.recurring.length}`,
  ].join('\n')
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^`{3,}(?:json)?\s*\n?/, '').replace(/\n?`{3,}\s*$/, '')
}

export async function analyzeHealthAndPatterns(
  provider: LLMProvider,
  providerName: ProviderName,
  data: CompactFinancialData,
  model: string
): Promise<HealthAndPatternsResult> {
  const stats = buildSummaryStats(data)
  const prompt = getHealthAndPatternsPrompt(providerName)
  const filledPrompt = prompt.user
    .replace('{summary_stats}', stats)
    .replace('{data_json}', JSON.stringify(data))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const parsed = JSON.parse(stripCodeFences(response.text))
  return healthAndPatternsSchema.parse(parsed)
}

export async function analyzeDeepInsights(
  provider: LLMProvider,
  providerName: ProviderName,
  data: CompactFinancialData,
  health: HealthAssessment,
  model: string
): Promise<DeepInsight[]> {
  const prompt = getDeepInsightsPrompt(providerName)
  const system = prompt.system!
    .replace('{score}', String(health.score))
    .replace('{summary}', health.summary)
  const stats = buildSummaryStats(data)
  const filledPrompt = prompt.user
    .replace('{summary_stats}', stats)
    .replace('{data_json}', JSON.stringify(data))

  const response = await provider.complete({
    system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const parsed = JSON.parse(stripCodeFences(response.text))
  const result = deepInsightSchema.parse(parsed)

  return result.insights.map((insight, i) => ({
    id: `llm-insight-${i}`,
    ...insight,
  }))
}
