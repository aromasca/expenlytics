import type { LLMProvider, ProviderName } from './types'
import { getNormalizationPrompt } from './prompts/normalization'
import { normalizationSchema, type NormalizationResult } from './schemas'

// Smaller models (nano/mini) need smaller batches to avoid hitting output token limits
const BATCH_SIZE_LARGE = 80
const BATCH_SIZE_SMALL = 30
const SMALL_MODELS = ['gpt-5-mini', 'gpt-4o-mini', 'claude-haiku']

function getBatchSize(model: string): number {
  return SMALL_MODELS.some(m => model.includes(m)) ? BATCH_SIZE_SMALL : BATCH_SIZE_LARGE
}

async function normalizeBatch(provider: LLMProvider, providerName: ProviderName, batch: string[], model: string, existingMerchants?: string[]): Promise<Map<string, string>> {
  let existingMerchantsBlock = ''
  if (existingMerchants && existingMerchants.length > 0) {
    // Limit context for smaller models
    const limit = SMALL_MODELS.some(m => model.includes(m)) ? 50 : 100
    const list = JSON.stringify(existingMerchants.slice(0, limit))
    existingMerchantsBlock = `EXISTING MERCHANT NAMES (match to these when the description refers to the same business):\n${list}\n\n`
  }

  const prompt = getNormalizationPrompt(providerName)
  const filledPrompt = prompt.user
    .replace('{existing_merchants_block}', existingMerchantsBlock)
    .replace('{descriptions_json}', JSON.stringify(batch, null, 2))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const text = response.text
  if (!text.trim()) throw new Error(`Empty response from ${providerName}/${model} during normalization`)
  let jsonStr = text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }
  // Handle unclosed code fence (truncated response)
  if (!jsonMatch) {
    const openFence = jsonStr.match(/```(?:json)?\s*([\s\S]*)/)
    if (openFence) jsonStr = openFence[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  const result: NormalizationResult = normalizationSchema.parse(parsed)

  const map = new Map<string, string>()
  for (const { description, merchant } of result.normalizations) {
    map.set(description, merchant)
  }
  return map
}

export async function normalizeMerchants(provider: LLMProvider, providerName: ProviderName, descriptions: string[], model: string, existingMerchants?: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(descriptions)]
  if (unique.length === 0) return new Map()

  const map = new Map<string, string>()

  const batchSize = getBatchSize(model)
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const batchResult = await normalizeBatch(provider, providerName, batch, model, existingMerchants)
    for (const [desc, merchant] of batchResult) {
      map.set(desc, merchant)
    }
  }

  return map
}
