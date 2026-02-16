import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { suggestMerchantMerges } from '@/lib/llm/suggest-merges'

function createMockProvider(responseText: string) {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider,
    mockComplete,
    mockExtract,
  }
}

describe('suggestMerchantMerges', () => {
  it('parses LLM response into merge suggestions', async () => {
    const { provider } = createMockProvider(JSON.stringify([
      { canonical: 'Cincinnati Insurance', variants: ['Cincinnati Insurance', 'The Cincinnati Insurance'] },
      { canonical: 'Healthy Paws Pet Insurance', variants: ['Healthy Paws Pet Insurance', 'Healthy Paws'] },
    ]))

    const result = await suggestMerchantMerges(
      provider, 'anthropic',
      ['Netflix', 'Cincinnati Insurance', 'The Cincinnati Insurance', 'Healthy Paws Pet Insurance', 'Healthy Paws', 'Spotify'],
      'claude-sonnet-4-5-20250929'
    )

    expect(result).toHaveLength(2)
    expect(result[0].canonical).toBe('Cincinnati Insurance')
    expect(result[0].variants).toContain('The Cincinnati Insurance')
    expect(result[1].canonical).toBe('Healthy Paws Pet Insurance')
  })

  it('returns empty array when LLM finds no duplicates', async () => {
    const { provider } = createMockProvider('[]')

    const result = await suggestMerchantMerges(
      provider, 'anthropic', ['Netflix', 'Spotify'], 'claude-sonnet-4-5-20250929'
    )

    expect(result).toEqual([])
  })

  it('handles markdown-wrapped JSON response', async () => {
    const { provider } = createMockProvider(
      '```json\n[{"canonical": "Chase", "variants": ["Chase", "JPMorgan Chase"]}]\n```'
    )

    const result = await suggestMerchantMerges(
      provider, 'anthropic', ['Chase', 'JPMorgan Chase'], 'claude-sonnet-4-5-20250929'
    )

    expect(result).toHaveLength(1)
    expect(result[0].canonical).toBe('Chase')
  })

  it('returns empty array for fewer than 2 merchants', async () => {
    const { provider } = createMockProvider('[]')

    const result = await suggestMerchantMerges(
      provider, 'anthropic', ['Netflix'], 'claude-sonnet-4-5-20250929'
    )

    expect(result).toEqual([])
  })

  it('handles single object response (not array)', async () => {
    const { provider } = createMockProvider(
      JSON.stringify({ canonical: 'Chase', variants: ['Chase', 'JPMorgan Chase'] })
    )

    const result = await suggestMerchantMerges(
      provider, 'anthropic', ['Chase', 'JPMorgan Chase'], 'claude-sonnet-4-5-20250929'
    )

    expect(result).toHaveLength(1)
    expect(result[0].canonical).toBe('Chase')
  })
})
