import { describe, it, expect } from 'vitest'
import { extractionSchema, rawExtractionSchema } from '@/lib/claude/schemas'

describe('extractionSchema', () => {
  it('validates correct extraction output with category and transaction_class', () => {
    const valid = {
      document_type: 'checking_account' as const,
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries', transaction_class: 'purchase' },
        { date: '2025-01-16', description: 'Employer Inc', amount: 3000, type: 'credit', category: 'Salary & Wages', transaction_class: 'purchase' },
      ],
    }
    expect(extractionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects invalid type', () => {
    const invalid = {
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Store', amount: 50, type: 'refund', category: 'General Merchandise', transaction_class: 'purchase' },
      ],
    }
    expect(() => extractionSchema.parse(invalid)).toThrow()
  })

  it('rejects invalid document type', () => {
    const invalid = {
      document_type: 'unknown_type',
      transactions: [
        { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', category: 'General Merchandise', transaction_class: 'purchase' },
      ],
    }
    expect(() => extractionSchema.parse(invalid)).toThrow()
  })

  it('rejects missing fields', () => {
    const invalid = {
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', amount: 50 },
      ],
    }
    expect(() => extractionSchema.parse(invalid)).toThrow()
  })

  it('accepts any category string (LLM decides)', () => {
    const valid = {
      document_type: 'checking_account' as const,
      transactions: [
        { date: '2025-01-15', description: 'Dentist', amount: 200, type: 'debit', category: 'Medical & Dental', transaction_class: 'purchase' },
      ],
    }
    expect(extractionSchema.parse(valid).transactions[0].category).toBe('Medical & Dental')
  })

  it('rejects invalid transaction_class', () => {
    const invalid = {
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', category: 'General Merchandise', transaction_class: 'unknown' },
      ],
    }
    expect(() => extractionSchema.parse(invalid)).toThrow()
  })
})

describe('rawExtractionSchema', () => {
  it('validates transaction_class enum', () => {
    const valid = {
      document_type: 'credit_card' as const,
      transactions: [
        { date: '2025-01-15', description: 'Amazon', amount: 42.99, type: 'debit', transaction_class: 'purchase' },
        { date: '2025-01-16', description: 'Payment Received', amount: 500, type: 'credit', transaction_class: 'payment' },
        { date: '2025-01-17', description: 'Return', amount: 20, type: 'credit', transaction_class: 'refund' },
        { date: '2025-01-18', description: 'Annual Fee', amount: 95, type: 'debit', transaction_class: 'fee' },
        { date: '2025-01-19', description: 'Interest Charge', amount: 15, type: 'debit', transaction_class: 'interest' },
        { date: '2025-01-20', description: 'Balance Transfer', amount: 1000, type: 'debit', transaction_class: 'transfer' },
      ],
    }
    const result = rawExtractionSchema.parse(valid)
    expect(result.transactions).toHaveLength(6)
    expect(result.transactions[0].transaction_class).toBe('purchase')
  })

  it('rejects missing transaction_class', () => {
    const invalid = {
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'Amazon', amount: 42.99, type: 'debit' },
      ],
    }
    expect(() => rawExtractionSchema.parse(invalid)).toThrow()
  })
})
