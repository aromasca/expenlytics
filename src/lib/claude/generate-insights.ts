import Anthropic from '@anthropic-ai/sdk'
import { llmInsightSchema, type LLMInsightData } from './schemas'
import type { DataSummary } from '@/lib/insights/data-summary'

const SYSTEM_PROMPT = `You are an expert financial analyst reviewing a person's spending data. Your job is to find genuinely surprising, actionable insights — the kind of observations that make someone say "I had no idea."

Quality criteria:
- Cross-category correlations (e.g., dining up when groceries down = eating out more)
- Unusual merchant patterns (frequency changes, new high-spend merchants)
- Seasonal or timing anomalies
- Hidden costs (small recurring charges adding up)
- Positive trends worth reinforcing

Do NOT repeat obvious facts. If groceries went up 20%, don't just say "groceries went up" — explain WHY it matters or what it correlates with.

Return 8-12 insights as JSON. Each insight must include evidence referencing specific categories or merchants from the data.`

const USER_PROMPT = `Here is a 6-month spending summary. Analyze it and return insights as JSON.

{summary_json}

Return ONLY valid JSON in this format:
{
  "insights": [
    {
      "headline": "Short attention-grabbing title",
      "category": "primary spending category involved",
      "severity": "concerning|notable|favorable|informational",
      "key_metric": "$X/mo or X% change — the number that matters",
      "explanation": "2-3 sentences explaining the insight and why it matters",
      "evidence": {
        "category_a": "primary category name (optional)",
        "category_b": "secondary category name (optional)",
        "merchant_names": ["merchant1", "merchant2"]
      },
      "action_suggestion": "One concrete action to take (optional)"
    }
  ]
}`

export async function generateInsights(summary: DataSummary): Promise<LLMInsightData> {
  const client = new Anthropic()

  const prompt = USER_PROMPT.replace('{summary_json}', JSON.stringify(summary, null, 2))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return llmInsightSchema.parse(parsed)
}
