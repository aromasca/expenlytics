import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider } from '@/lib/llm/types'
import { extractRawTransactions, classifyTransactions, reclassifyTransactions } from '@/lib/llm/extract-transactions'

function createMockProvider(responseText: string) {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider,
    mockComplete,
    mockExtract,
  }
}

describe('extractRawTransactions', () => {
  it('extracts transactions without categories', async () => {
    const responseJSON = JSON.stringify({
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', transaction_class: 'purchase' },
        { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit', transaction_class: 'purchase' },
      ],
    })
    const { provider, mockExtract } = createMockProvider(responseJSON)

    const fakePdf = Buffer.from('fake pdf content')
    const result = await extractRawTransactions(provider, 'anthropic', fakePdf, 'claude-sonnet-4-5-20250929')

    expect(result.document_type).toBe('checking_account')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].description).toBe('Whole Foods')
    expect(result.transactions[0]).not.toHaveProperty('category')
    expect(result.transactions[1].type).toBe('credit')
    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(mockExtract.mock.calls[0][0].model).toBe('claude-sonnet-4-5-20250929')
    expect(mockExtract.mock.calls[0][0].document).toBe(fakePdf)
  })

  it('handles markdown code fences in response', async () => {
    const json = JSON.stringify({
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'Target', amount: 42.99, type: 'debit', transaction_class: 'purchase' },
      ],
    })
    const responseText = '```json\n' + json + '\n```'
    const { provider } = createMockProvider(responseText)

    const result = await extractRawTransactions(provider, 'anthropic', Buffer.from('pdf'), 'test-model')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].description).toBe('Target')
  })
})

describe('classifyTransactions', () => {
  it('classifies raw transactions by index', async () => {
    const responseJSON = JSON.stringify({
      classifications: [
        { index: 0, category: 'Groceries' },
        { index: 1, category: 'Salary & Wages' },
      ],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const transactions = [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' as const, transaction_class: 'purchase' as const },
      { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit' as const, transaction_class: 'purchase' as const },
    ]
    const result = await classifyTransactions(provider, 'anthropic', 'checking_account', transactions, 'test-model')

    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ index: 0, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ index: 1, category: 'Salary & Wages' })
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })

  it('includes known mappings in prompt when provided', async () => {
    const responseJSON = JSON.stringify({
      classifications: [{ index: 0, category: 'Groceries' }],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const transactions = [
      { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' as const, transaction_class: 'purchase' as const },
    ]
    const knownMappings = [{ merchant: 'Whole Foods', category: 'Groceries' }]

    await classifyTransactions(provider, 'anthropic', 'checking_account', transactions, 'test-model', knownMappings)

    const prompt = mockComplete.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('KNOWN MERCHANT CLASSIFICATIONS')
    expect(prompt).toContain('Whole Foods')
  })
})

describe('reclassifyTransactions', () => {
  it('returns category assignments for given transactions', async () => {
    const responseJSON = JSON.stringify({
      classifications: [
        { id: 1, category: 'Groceries' },
        { id: 2, category: 'Transfer' },
      ],
    })
    const { provider, mockComplete } = createMockProvider(responseJSON)

    const result = await reclassifyTransactions(provider, 'anthropic', 'credit_card', [
      { id: 1, date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit' },
      { id: 2, date: '2025-01-16', description: 'Payment Thank You', amount: 500, type: 'credit' },
    ], 'test-model')

    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0]).toEqual({ id: 1, category: 'Groceries' })
    expect(result.classifications[1]).toEqual({ id: 2, category: 'Transfer' })
    expect(mockComplete).toHaveBeenCalledTimes(1)
  })
})
