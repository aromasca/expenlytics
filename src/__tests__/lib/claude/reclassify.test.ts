import { describe, it, expect, vi } from 'vitest'
import { reclassifyTransactions } from '@/lib/claude/extract-transactions'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              classifications: [
                { id: 1, category: 'Groceries' },
                { id: 2, category: 'Transfer' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('reclassifyTransactions', () => {
  it('returns category assignments for given transactions', async () => {
    const result = await reclassifyTransactions('credit_card', [
      { id: 1, date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
      { id: 2, date: '2025-01-16', description: 'Payment Thank You', amount: 500, type: 'credit' },
    ])
    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ id: 1, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ id: 2, category: 'Transfer' })
  })
})
