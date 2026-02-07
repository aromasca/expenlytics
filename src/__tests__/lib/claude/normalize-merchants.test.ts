import { describe, it, expect, vi } from 'vitest'
import { normalizeMerchants } from '@/lib/claude/normalize-merchants'

const mockCreate = vi.fn().mockResolvedValue({
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
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
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
    mockCreate.mockClear()

    const descriptions = ['NETFLIX.COM 1234', 'NETFLIX.COM 1234', 'NETFLIX.COM 1234']
    await normalizeMerchants(descriptions)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    // The prompt should contain only one instance of the description (deduplicated)
    const matches = prompt.match(/NETFLIX\.COM 1234/g)
    expect(matches).toHaveLength(1)
  })
})
