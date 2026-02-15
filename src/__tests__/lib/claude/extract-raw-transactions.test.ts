import { describe, it, expect, vi } from 'vitest'
import { extractRawTransactions } from '@/lib/claude/extract-transactions'

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              document_type: 'checking_account',
              transactions: [
                { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', transaction_class: 'purchase' },
                { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit', transaction_class: 'purchase' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('extractRawTransactions', () => {
  it('extracts transactions without categories', async () => {
    const fakePdf = Buffer.from('fake pdf content')
    const result = await extractRawTransactions(fakePdf)
    expect(result.document_type).toBe('checking_account')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Whole Foods')
    expect(result.transactions[0]).not.toHaveProperty('category')
    expect(result.transactions[1].type).toBe('credit')
  })
})
