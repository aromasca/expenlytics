import { z } from 'zod'
import type { LLMProvider, ProviderName } from './types'

const mergeSuggestionSchema = z.union([
  z.array(z.object({
    canonical: z.string(),
    variants: z.union([z.array(z.string()), z.string().transform(v => [v])]),
  })),
  z.object({
    canonical: z.string(),
    variants: z.union([z.array(z.string()), z.string().transform(v => [v])]),
  }).transform(v => [v]),
])

export type MergeSuggestion = { canonical: string; variants: string[] }

export async function suggestMerchantMerges(
  provider: LLMProvider,
  providerName: ProviderName,
  merchantNames: string[],
  model: string
): Promise<MergeSuggestion[]> {
  if (merchantNames.length < 2) return []

  const response = await provider.complete({
    system: `You are a data cleanup assistant. Your job is to identify merchant names that refer to the same business but are written differently. Only group names that are clearly the same business — do not guess. Return a JSON array.`,
    messages: [{
      role: 'user',
      content: `Here are merchant names from a financial app. Identify groups where multiple names refer to the SAME business (e.g. "The Cincinnati Insurance" and "Cincinnati Insurance", or "Costco" and "Costco Wholesale").

IMPORTANT: Do NOT merge different financial products from the same institution. Mortgage payments, credit card payments, and loan payments are separate merchants even if they share a bank name (e.g. "JPMorgan Chase Mortgage" and "Chase Credit Card" should NOT be merged).

Return ONLY a JSON array of objects with "canonical" (best name) and "variants" (all names including canonical). If no duplicates exist, return [].

Merchant names (one per line):
${merchantNames.join('\n')}`,
    }],
    maxTokens: 8192,
    model,
  })

  const text = response.text
  if (!text.trim()) return []

  let jsonStr = text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  else {
    const openFence = jsonStr.match(/```(?:json)?\s*([\s\S]*)/)
    if (openFence) jsonStr = openFence[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return mergeSuggestionSchema.parse(parsed)
}
