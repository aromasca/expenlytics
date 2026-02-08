import { describe, it, expect } from 'vitest'
import { extractionSchema } from '@/lib/claude/schemas'

describe('extractionSchema', () => {
  it('validates correct extraction output with category', () => {
    const valid = {
      document_type: 'checking_account' as const,
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', category: 'Groceries' },
        { date: '2025-01-16', description: 'Employer Inc', amount: 3000, type: 'credit', category: 'Salary & Wages' },
      ],
    }
    expect(extractionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects invalid type', () => {
    const invalid = {
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Store', amount: 50, type: 'refund', category: 'General Merchandise' },
      ],
    }
    expect(() => extractionSchema.parse(invalid)).toThrow()
  })

  it('rejects invalid document type', () => {
    const invalid = {
      document_type: 'unknown_type',
      transactions: [
        { date: '2025-01-15', description: 'Store', amount: 50, type: 'debit', category: 'General Merchandise' },
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
        { date: '2025-01-15', description: 'Dentist', amount: 200, type: 'debit', category: 'Medical & Dental' },
      ],
    }
    expect(extractionSchema.parse(valid).transactions[0].category).toBe('Medical & Dental')
  })
})
