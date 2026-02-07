import Anthropic from '@anthropic-ai/sdk'
import { normalizationSchema, type NormalizationResult } from './schemas'

const NORMALIZATION_PROMPT = `You are a financial transaction merchant normalizer. Given a list of transaction descriptions from bank/credit card statements, normalize each to a clean, canonical merchant name.

RULES:
- Map variations of the same merchant to ONE canonical name (e.g., "AMZN MKTP US*1A2B3C" and "Amazon.com*4D5E6F" → "Amazon")
- Strip transaction codes, reference numbers, location suffixes, and store numbers
- Use the well-known brand name when recognizable (e.g., "SQ *BLUE BOTTLE" → "Blue Bottle Coffee")
- Keep the name human-readable and title-cased
- For unrecognizable merchants, clean up the name as best you can
- Every input description MUST appear exactly once in the output

Return ONLY valid JSON:
{
  "normalizations": [
    {"description": "<original>", "merchant": "<normalized>"}
  ]
}

Descriptions to normalize:
{descriptions_json}`

export async function normalizeMerchants(descriptions: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(descriptions)]
  if (unique.length === 0) return new Map()

  const client = new Anthropic()

  const prompt = NORMALIZATION_PROMPT
    .replace('{descriptions_json}', JSON.stringify(unique, null, 2))

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
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
  const result: NormalizationResult = normalizationSchema.parse(parsed)

  const map = new Map<string, string>()
  for (const { description, merchant } of result.normalizations) {
    map.set(description, merchant)
  }

  return map
}
