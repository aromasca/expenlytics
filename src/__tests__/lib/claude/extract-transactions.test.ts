import { describe, it, expect, vi } from 'vitest'
import { extractTransactions } from '@/lib/claude/extract-transactions'

// Mock the Anthropic SDK
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
                { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries' },
                { date: '2025-01-16', description: 'Salary', amount: 3000, type: 'credit', category: 'Income' },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: MockAnthropic }
})

describe('extractTransactions', () => {
  it('extracts transactions with categories and document type from PDF buffer', async () => {
    const fakePdf = Buffer.from('fake pdf content')
    const result = await extractTransactions(fakePdf)
    expect(result.document_type).toBe('checking_account')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Whole Foods')
    expect(result.transactions[0].category).toBe('Groceries')
    expect(result.transactions[1].type).toBe('credit')
    expect(result.transactions[1].category).toBe('Income')
  })
})
