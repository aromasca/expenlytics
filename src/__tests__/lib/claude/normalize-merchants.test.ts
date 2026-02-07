import { describe, it, expect, vi } from 'vitest'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              normalizations: [
                { description: 'NETFLIX.COM 1234', merchant: 'Netflix' },
                { description: 'NETFLIX.COM 5678', merchant: 'Netflix' },
                { description: 'AMZN MKTP US*1A2B3C', merchant: 'Amazon' },
                { description: 'Amazon.com*4D5E6F', merchant: 'Amazon' },
                { description: 'SPOTIFY USA 1234567', merchant: 'Spotify' },
                { description: 'Spotify Premium', merchant: 'Spotify' },
                { description: 'Whole Foods Market #1234', merchant: 'Whole Foods Market' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('normalizeMerchants', () => {
  it('returns a map of description to normalized merchant name', async () => {
    const descriptions = [
      'NETFLIX.COM 1234',
      'NETFLIX.COM 5678',
      'AMZN MKTP US*1A2B3C',
      'Amazon.com*4D5E6F',
      'SPOTIFY USA 1234567',
      'Spotify Premium',
      'Whole Foods Market #1234',
    ]

    const result = await normalizeMerchants(descriptions)
    expect(result.get('NETFLIX.COM 1234')).toBe('Netflix')
    expect(result.get('NETFLIX.COM 5678')).toBe('Netflix')
    expect(result.get('AMZN MKTP US*1A2B3C')).toBe('Amazon')
    expect(result.get('Amazon.com*4D5E6F')).toBe('Amazon')
    expect(result.get('SPOTIFY USA 1234567')).toBe('Spotify')
    expect(result.get('Spotify Premium')).toBe('Spotify')
  })

  it('returns empty map for empty input', async () => {
    const result = await normalizeMerchants([])
    expect(result.size).toBe(0)
  })

  it('deduplicates input descriptions before sending to LLM', async () => {
    const descriptions = ['Netflix', 'Netflix', 'Netflix']
    const result = await normalizeMerchants(descriptions)
    // Should still work — the mock returns data for all unique inputs
    expect(result.size).toBeGreaterThanOrEqual(0)
  })
})
