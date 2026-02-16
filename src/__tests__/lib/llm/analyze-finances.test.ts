import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { analyzeFinances } from '@/lib/llm/analyze-finances'
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
  top_merchants_by_category: [],
  recent_transactions: [
    { date: '2026-01-15', description: 'Whole Foods Market', normalized_merchant: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries', transaction_class: 'purchase' },
  ],
  merchant_month_deltas: [
    { merchant: 'Whole Foods', months: { '2026-01': 400, '2025-12': 350 } },
  ],
}

describe('analyzeFinances', () => {
  it('makes a single LLM call and returns health + insights', async () => {
    const responseJSON = JSON.stringify({
      health: {
        score: 72,
        summary: 'Solid finances with room to improve savings',
        color: 'green',
        metrics: [
          { label: 'Savings Rate', value: '30%', trend: 'down', sentiment: 'good' },
        ],
      },
      insights: [{
        type: 'behavioral_shift',
        headline: 'Grocery-to-delivery shift',
        severity: 'concerning',
        explanation: 'Your grocery spending dropped while food delivery doubled.',
        evidence: { categories: ['Groceries', 'Food Delivery'], time_period: 'Jan vs Dec' },
        action: 'Try meal planning to reduce delivery reliance.',
      }],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeFinances(provider, 'anthropic', SAMPLE_DATA, 'claude-sonnet-4-5-20250929')

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(result.health.score).toBe(72)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0]).toMatchObject({
      id: 'llm-insight-0',
      type: 'behavioral_shift',
      headline: 'Grocery-to-delivery shift',
    })
  })

  it('includes recent_transactions context in prompt', async () => {
    const responseJSON = JSON.stringify({
      health: { score: 50, summary: 'OK', color: 'yellow', metrics: [] },
      insights: [],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    await analyzeFinances(provider, 'anthropic', SAMPLE_DATA, 'claude-sonnet-4-5-20250929')

    const userPrompt = mockComplete.mock.calls[0][0].messages[0].content as string
    expect(userPrompt).toContain('Whole Foods Market')
    expect(userPrompt).toContain('recent_transactions')
  })

  it('works with openai provider name', async () => {
    const responseJSON = JSON.stringify({
      health: { score: 60, summary: 'Fair', color: 'yellow', metrics: [] },
      insights: [],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await analyzeFinances(provider, 'openai', SAMPLE_DATA, 'gpt-5')

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(result.health.score).toBe(60)
  })
})
