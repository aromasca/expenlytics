import { describe, it, expect, vi } from 'vitest'
import type { DataSummary } from '@/lib/insights/data-summary'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
  }
  return { default: MockAnthropic }
})

const { generateInsights } = await import('@/lib/claude/generate-insights')

const emptySummary: DataSummary = {
  monthly_by_category: [],
  top_merchants: [],
  category_changes: [],
  outliers: [],
  metadata: { date_range: '2025-01 to 2025-06', transaction_count: 50, total_spend: 5000 },
}

describe('generateInsights', () => {
  it('parses valid LLM response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          insights: [{
            headline: 'Dining is replacing groceries',
            category: 'Restaurants & Dining',
            severity: 'concerning',
            key_metric: '+$200/mo',
            explanation: 'Your dining spend increased while groceries dropped.',
            evidence: { category_a: 'Restaurants & Dining', category_b: 'Groceries', merchant_names: ['DoorDash'] },
            action_suggestion: 'Try meal prepping on Sundays',
          }],
        }),
      }],
    })

    const result = await generateInsights(emptySummary)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].headline).toBe('Dining is replacing groceries')
    expect(result.insights[0].severity).toBe('concerning')
  })

  it('handles markdown-fenced JSON response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: '```json\n{"insights": [{"headline": "Test", "category": "Other", "severity": "informational", "key_metric": "$0", "explanation": "Test", "evidence": {}}]}\n```',
      }],
    })

    const result = await generateInsights(emptySummary)
    expect(result.insights).toHaveLength(1)
  })

  it('throws on invalid response structure', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"not_insights": []}' }],
    })

    await expect(generateInsights(emptySummary)).rejects.toThrow()
  })

  it('throws when no text block returned', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] })
    await expect(generateInsights(emptySummary)).rejects.toThrow('No text response from Claude')
  })
})
