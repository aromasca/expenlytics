import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { analyzeHealthAndPatterns, analyzeDeepInsights } from '@/lib/llm/analyze-finances'
import type { CompactFinancialData } from '@/lib/insights/compact-data'

function createMockProvider(responseText: string) {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider,
    mockComplete,
    mockExtract,
  }
}

const SAMPLE_DATA: CompactFinancialData = {
  monthly: [
    { month: '2026-01', income: 5000, spending: 3500, net: 1500 },
    { month: '2025-12', income: 5000, spending: 3200, net: 1800 },
  ],
  categories: [{ category: 'Groceries', amounts: { '2026-01': 400, '2025-12': 350 } }],
  merchants: [{ name: 'Whole Foods', total: 750, count: 8, avg: 93.75, last_seen: '2026-01-28', first_seen: '2025-08-15', months_active: 6 }],
  day_of_week: [
    { day: 'Sunday', avg_spend: 50, transaction_count: 10 },
    { day: 'Monday', avg_spend: 80, transaction_count: 15 },
    { day: 'Tuesday', avg_spend: 70, transaction_count: 12 },
    { day: 'Wednesday', avg_spend: 75, transaction_count: 14 },
    { day: 'Thursday', avg_spend: 85, transaction_count: 16 },
    { day: 'Friday', avg_spend: 120, transaction_count: 20 },
    { day: 'Saturday', avg_spend: 90, transaction_count: 18 },
  ],
  daily_recent: [{ date: '2026-01-15', amount: 150, is_income_day: true }],
  recurring: [{ merchant: 'Netflix', amount: 15.99, frequency: 'monthly', months: 6 }],
  outliers: [],
}

describe('analyzeHealthAndPatterns', () => {
  it('parses LLM response into health assessment and patterns', async () => {
    const responseJSON = JSON.stringify({
      health: {
        score: 72,
        summary: 'Solid finances with room to improve savings',
        color: 'green',
        metrics: [
          { label: 'Savings Rate', value: '30%', trend: 'down', sentiment: 'good' },
          { label: 'Monthly Burn', value: '$3,500', trend: 'up', sentiment: 'neutral' },
        ],
      },
      patterns: [{
        id: 'friday-spending',
        headline: 'Friday Spending Spike',
        metric: '$120 avg on Fridays vs $75 other days',
        explanation: 'Your Friday spending is 60% higher than your weekday average.',
        category: 'timing',
        severity: 'notable',
        evidence: { time_period: 'Fridays' },
      }],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeHealthAndPatterns(provider, 'anthropic', SAMPLE_DATA, 'claude-haiku-4-5-20251001')

    expect(result.health.score).toBe(72)
    expect(result.health.metrics.length).toBeGreaterThanOrEqual(1)
    expect(result.patterns.length).toBeGreaterThanOrEqual(1)
    expect(result.patterns[0].headline).toBe('Friday Spending Spike')
    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(mockComplete.mock.calls[0][0].system).toBeDefined()
  })
})

describe('analyzeDeepInsights', () => {
  it('parses LLM response into deep insights', async () => {
    const responseJSON = JSON.stringify({
      insights: [{
        headline: 'Grocery spending is steady',
        severity: 'favorable',
        key_metric: '$400/mo',
        explanation: 'Your grocery spending has been consistent.',
        evidence: { category_a: 'Groceries' },
      }],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeDeepInsights(provider, 'anthropic', SAMPLE_DATA, {
      score: 72, summary: 'Good', color: 'green' as const, metrics: []
    }, 'claude-haiku-4-5-20251001')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].headline).toBe('Grocery spending is steady')
    expect(result[0].id).toBe('llm-insight-0')
    expect(mockComplete).toHaveBeenCalledTimes(1)

    // Verify the system prompt has the score/summary filled in
    const systemPrompt = mockComplete.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('72')
    expect(systemPrompt).toContain('Good')
  })
})
