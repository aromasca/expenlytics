import Anthropic from '@anthropic-ai/sdk'
import { healthAndPatternsSchema, deepInsightSchema, type HealthAndPatternsResult } from './schemas'
import type { CompactFinancialData } from '@/lib/insights/compact-data'
import type { HealthAssessment, DeepInsight } from '@/lib/insights/types'

const HEALTH_AND_PATTERNS_SYSTEM = `You are an expert financial analyst. Given compact transaction data, produce two things:

1. A HEALTH ASSESSMENT: Score 0-100, one-line summary, color (green ≥70, yellow 40-69, red <40), and 4-5 key metrics (savings rate, monthly burn, subscription burden, etc.)

2. BEHAVIORAL PATTERNS: 6-8 specific, surprising observations about spending behavior. Each must have a concrete metric. Look for:
   - Temporal patterns: payday spending spikes, weekend vs weekday, day-of-week patterns
   - Merchant patterns: loyalty concentration, dormant subscriptions, price creep
   - Cross-category correlations: e.g., groceries down + delivery up = eating out more
   - Spending velocity: front-loading vs back-loading within months
   - Unusual recent behavior vs historical baseline

ACCURACY RULES — MANDATORY:
- Every number you cite (dollar amounts, transaction counts, percentages) MUST be derived directly from the provided JSON data.
- For merchants: the "total", "count", and "avg" fields in the merchants array are the ONLY valid figures. Do NOT invent transaction counts or totals.
- Do NOT mention merchants that are not present in the data.
- If a merchant has count:1, it is a single transaction — do not describe it as recurring or frequent.
- When computing percentages, use the monthly totals from the data. Show your math if needed.

Be specific with numbers. "Fridays cost $120/day vs $75 average" is better than "you spend more on Fridays."
Don't repeat obvious facts. Find what's surprising or actionable.`

const HEALTH_AND_PATTERNS_USER = `Here is the compact financial data. Analyze it and return JSON.

KEY TOTALS (pre-computed from the data — use these as ground truth):
{summary_stats}

FULL DATA:
{data_json}

Return ONLY valid JSON in this exact format:
{
  "health": {
    "score": 0-100,
    "summary": "one line",
    "color": "green|yellow|red",
    "metrics": [{"label": "...", "value": "...", "trend": "up|down|stable", "sentiment": "good|neutral|bad"}]
  },
  "patterns": [
    {
      "id": "unique-slug",
      "headline": "Short title",
      "metric": "The key number",
      "explanation": "2-3 sentences",
      "category": "timing|merchant|behavioral|subscription|correlation",
      "severity": "concerning|notable|favorable|informational",
      "evidence": {"merchants": [], "categories": [], "time_period": ""}
    }
  ]
}`

const DEEP_INSIGHTS_SYSTEM = `You are an expert financial advisor reviewing someone's spending data. Your health assessment scored them {score}/100: "{summary}"

Now produce 8-12 deep, narrative insights. Each should be genuinely surprising and actionable — the kind of observation that makes someone say "I had no idea."

ACCURACY RULES — MANDATORY:
- Every number you cite (dollar amounts, transaction counts, percentages) MUST be derived directly from the provided JSON data.
- For merchants: use ONLY the "total", "count", and "avg" fields from the merchants array. Do NOT invent figures.
- Do NOT mention merchants that are not present in the data.
- If a merchant has count:1, it is a single transaction — do not describe it as recurring or frequent.
- When computing percentages, use the monthly totals from the data.

Quality criteria:
- Cross-correlations between spending categories
- Merchant-level intelligence (unused subscriptions, loyalty patterns)
- Behavioral observations grounded in timing data
- Actionable recommendations tied to specific dollar amounts
- Positive trends worth reinforcing

Do NOT repeat the health assessment or pattern observations. Go deeper.`

const DEEP_INSIGHTS_USER = `Here is the compact financial data:

KEY TOTALS (pre-computed from the data — use these as ground truth):
{summary_stats}

FULL DATA:
{data_json}

Return ONLY valid JSON:
{
  "insights": [
    {
      "headline": "Short attention-grabbing title",
      "severity": "concerning|notable|favorable|informational",
      "key_metric": "The key number",
      "explanation": "2-3 sentences",
      "action_suggestion": "One concrete action (optional)",
      "evidence": {
        "category_a": "primary category (optional)",
        "category_b": "secondary category (optional)",
        "merchant_names": ["merchant1"]
      }
    }
  ]
}`

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

export async function analyzeHealthAndPatterns(data: CompactFinancialData, model = 'claude-haiku-4-5-20251001'): Promise<HealthAndPatternsResult> {
  const client = new Anthropic()
  const stats = buildSummaryStats(data)
  const prompt = HEALTH_AND_PATTERNS_USER
    .replace('{summary_stats}', stats)
    .replace('{data_json}', JSON.stringify(data))

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: HEALTH_AND_PATTERNS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const parsed = JSON.parse(stripCodeFences(textBlock.text))
  return healthAndPatternsSchema.parse(parsed)
}

export async function analyzeDeepInsights(
  data: CompactFinancialData,
  health: HealthAssessment,
  model = 'claude-haiku-4-5-20251001'
): Promise<DeepInsight[]> {
  const client = new Anthropic()
  const system = DEEP_INSIGHTS_SYSTEM
    .replace('{score}', String(health.score))
    .replace('{summary}', health.summary)
  const stats = buildSummaryStats(data)
  const prompt = DEEP_INSIGHTS_USER
    .replace('{summary_stats}', stats)
    .replace('{data_json}', JSON.stringify(data))

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const parsed = JSON.parse(stripCodeFences(textBlock.text))
  const result = deepInsightSchema.parse(parsed)

  return result.insights.map((insight, i) => ({
    id: `llm-insight-${i}`,
    ...insight,
  }))
}
