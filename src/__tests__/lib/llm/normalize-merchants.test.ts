import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { normalizeMerchants } from '@/lib/llm/normalize-merchants'

function createMockProvider(responseText: string) {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider,
    mockComplete,
    mockExtract,
  }
}

describe('normalizeMerchants', () => {
  it('returns a map of description to normalized merchant name', async () => {
    const responseJSON = JSON.stringify({
      normalizations: [
        { description: 'NETFLIX.COM 1234', merchant: 'Netflix' },
        { description: 'NETFLIX.COM 5678', merchant: 'Netflix' },
        { description: 'AMZN MKTP US*1A2B3C', merchant: 'Amazon' },
        { description: 'Amazon.com*4D5E6F', merchant: 'Amazon' },
        { description: 'SPOTIFY USA 1234567', merchant: 'Spotify' },
        { description: 'Spotify Premium', merchant: 'Spotify' },
        { description: 'Whole Foods Market #1234', merchant: 'Whole Foods Market' },
      ],
    })
    const { provider } = createMockProvider(responseJSON)

    const descriptions = [
      'NETFLIX.COM 1234',
      'NETFLIX.COM 5678',
      'AMZN MKTP US*1A2B3C',
      'Amazon.com*4D5E6F',
      'SPOTIFY USA 1234567',
      'Spotify Premium',
      'Whole Foods Market #1234',
    ]

    const result = await normalizeMerchants(provider, 'anthropic', descriptions, 'claude-haiku-4-5-20251001')
    expect(result.get('NETFLIX.COM 1234')).toBe('Netflix')
    expect(result.get('NETFLIX.COM 5678')).toBe('Netflix')
    expect(result.get('AMZN MKTP US*1A2B3C')).toBe('Amazon')
    expect(result.get('Amazon.com*4D5E6F')).toBe('Amazon')
    expect(result.get('SPOTIFY USA 1234567')).toBe('Spotify')
    expect(result.get('Spotify Premium')).toBe('Spotify')
  })

  it('returns empty map for empty input', async () => {
    const { provider } = createMockProvider('{}')
    const result = await normalizeMerchants(provider, 'anthropic', [], 'test-model')
    expect(result.size).toBe(0)
  })

  it('deduplicates input descriptions before sending to LLM', async () => {
    const responseJSON = JSON.stringify({
      normalizations: [
        { description: 'NETFLIX.COM 1234', merchant: 'Netflix' },
      ],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const descriptions = ['NETFLIX.COM 1234', 'NETFLIX.COM 1234', 'NETFLIX.COM 1234']
    await normalizeMerchants(provider, 'anthropic', descriptions, 'test-model')

    expect(mockComplete).toHaveBeenCalledTimes(1)
    const prompt = mockComplete.mock.calls[0][0].messages[0].content as string
    // The prompt should contain only one instance of the description (deduplicated)
    const matches = prompt.match(/NETFLIX\.COM 1234/g)
    expect(matches).toHaveLength(1)
  })

  it('batches large input sets', async () => {
    // Create 100 unique descriptions (exceeds BATCH_SIZE of 80)
    const descriptions = Array.from({ length: 100 }, (_, i) => `MERCHANT_${i}`)
    const normalizations = descriptions.map(d => ({ description: d, merchant: d.replace('MERCHANT_', 'Merchant ') }))

    const mockComplete = vi.fn()
      .mockResolvedValueOnce({ text: JSON.stringify({ normalizations: normalizations.slice(0, 80) }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ normalizations: normalizations.slice(80) }) })
    const provider = { complete: mockComplete, extractFromDocument: vi.fn() } as LLMProvider

    const result = await normalizeMerchants(provider, 'anthropic', descriptions, 'test-model')

    expect(mockComplete).toHaveBeenCalledTimes(2)
    expect(result.size).toBe(100)
    expect(result.get('MERCHANT_0')).toBe('Merchant 0')
    expect(result.get('MERCHANT_99')).toBe('Merchant 99')
  })
})
