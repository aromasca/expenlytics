import { describe, it, expect } from 'vitest'
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats large numbers with commas and no decimals', () => {
    expect(formatCurrency(100123.35)).toBe('$100,123')
  })

  it('formats small numbers', () => {
    expect(formatCurrency(42.99)).toBe('$43')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0')
  })

  it('formats negative numbers', () => {
    expect(formatCurrency(-1500.75)).toBe('-$1,501')
  })
})

describe('formatCurrencyPrecise', () => {
  it('formats with 2 decimal places and commas', () => {
    expect(formatCurrencyPrecise(100123.35)).toBe('$100,123.35')
  })

  it('formats small numbers with cents', () => {
    expect(formatCurrencyPrecise(42.5)).toBe('$42.50')
  })

  it('formats zero', () => {
    expect(formatCurrencyPrecise(0)).toBe('$0.00')
  })
})
