import { describe, it, expect, vi } from 'vitest'
import { classifyTransactions } from '@/lib/claude/extract-transactions'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              classifications: [
                { index: 0, category: 'Groceries' },
                { index: 1, category: 'Salary & Wages' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('classifyTransactions', () => {
  it('classifies raw transactions by index', async () => {
    const transactions = [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' as const },
      { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit' as const },
    ]
    const result = await classifyTransactions('checking_account', transactions)
    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ index: 0, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ index: 1, category: 'Salary & Wages' })
  })
})
