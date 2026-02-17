import { describe, it, expect } from 'vitest'
import { detectRecurringGroups } from '@/lib/recurring'

describe('detectRecurringGroups', () => {
  it('groups transactions by normalized_merchant', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'NETFLIX.COM 1234', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Streaming Services', category_color: '#0EA5E9' },
      { id: 2, date: '2025-02-15', description: 'NETFLIX.COM 5678', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Streaming Services', category_color: '#0EA5E9' },
      { id: 3, date: '2025-03-15', description: 'NETFLIX.COM 9012', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Streaming Services', category_color: '#0EA5E9' },
      { id: 4, date: '2025-01-20', description: 'Whole Foods', normalized_merchant: 'Whole Foods Market', amount: 85.00, type: 'debit' as const, category_name: 'Groceries', category_color: '#22C55E' },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].merchantName).toBe('Netflix')
    expect(groups[0].occurrences).toBe(3)
    expect(groups[0].totalAmount).toBeCloseTo(47.97)
    expect(groups[0].avgAmount).toBeCloseTo(15.99)
  })

  it('requires at least 3 occurrences (raised from 2)', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    ]
    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })

  it('excludes charges on the same date (not recurring)', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'WALMART 1234', normalized_merchant: 'Walmart', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-15', description: 'WALMART 5678', normalized_merchant: 'Walmart', amount: 30.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })

  it('includes charges with varying amounts (price changes, extra fees)', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 16.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].merchantName).toBe('Netflix')
  })

  it('excludes charges within 14 days (same statement)', () => {
    const transactions = [
      { id: 1, date: '2025-01-10', description: 'COFFEE SHOP', normalized_merchant: 'Starbucks', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-15', description: 'COFFEE SHOP', normalized_merchant: 'Starbucks', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })

  it('calculates monthly frequency and estimated cost', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'Spotify', normalized_merchant: 'Spotify', amount: 9.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(9.99)
    expect(groups[0].frequency).toBe('monthly')
  })

  it('detects weekly frequency', () => {
    const transactions = [
      { id: 1, date: '2025-01-01', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-08', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-01-15', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-01-22', description: 'Gym', normalized_merchant: 'Planet Fitness', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].frequency).toBe('weekly')
  })

  it('detects yearly frequency', () => {
    const transactions = [
      { id: 1, date: '2024-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2026-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].frequency).toBe('yearly')
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(139.00 / 12)
  })

  it('detects yearly frequency with only 2 occurrences', () => {
    const transactions = [
      { id: 1, date: '2024-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-03-01', description: 'Amazon Prime', normalized_merchant: 'Amazon Prime', amount: 139.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].frequency).toBe('yearly')
    expect(groups[0].occurrences).toBe(2)
  })

  it('detects semi-annual frequency with 2 occurrences', () => {
    const transactions = [
      { id: 1, date: '2025-03-12', description: 'Insurance', normalized_merchant: 'Acme Insurance', amount: 600.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-09-16', description: 'Insurance', normalized_merchant: 'Acme Insurance', amount: 600.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].frequency).toBe('semi-annual')
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(600 / 6)
  })

  it('sorts groups by total amount descending', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-01-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 5, date: '2025-02-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 6, date: '2025-03-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].merchantName).toBe('Expensive SaaS')
    expect(groups[1].merchantName).toBe('Cheap SaaS')
  })

  it('includes transaction IDs, first and last dates', () => {
    const transactions = [
      { id: 10, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 15, date: '2025-02-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 20, date: '2025-03-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].transactionIds).toEqual([10, 15, 20])
    expect(groups[0].firstDate).toBe('2025-01-15')
    expect(groups[0].lastDate).toBe('2025-03-15')
  })

  it('groups case-insensitively and uses most common casing', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Chase ACH', normalized_merchant: 'Chase', amount: 100, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Chase ACH', normalized_merchant: 'Chase', amount: 100, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'JPMorgan Chase', normalized_merchant: 'JPMorgan Chase', amount: 100, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-04-15', description: 'chase', normalized_merchant: 'chase', amount: 100, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    // Chase (2) + JPMorgan Chase (1) + chase (1) — "Chase" and "chase" merge, "JPMorgan Chase" is separate
    expect(groups.some(g => g.merchantName === 'Chase' && g.occurrences === 3)).toBe(true)
    expect(groups.some(g => g.merchantName === 'JPMorgan Chase')).toBe(false) // only 1 occurrence
  })

  it('averages correctly after a price change', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 40.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 40.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 40.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-04-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 40.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 5, date: '2025-05-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 30.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 6, date: '2025-06-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 30.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 7, date: '2025-07-15', description: 'Acme SaaS', normalized_merchant: 'Acme SaaS', amount: 30.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    // $250 over 7 months — blended average between old and new price
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(250 / 7)
    expect(groups[0].avgAmount).toBeCloseTo((40 * 4 + 30 * 3) / 7)
  })

  it('handles billing date drift without inflating monthly cost', () => {
    // Billing drifts: Jan 30 → Mar 2 (skips Feb), so March has 2 charges
    // but it's still one charge per billing cycle
    const transactions = [
      { id: 1, date: '2024-12-31', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-30', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-02', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-03-30', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 5, date: '2025-05-02', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 6, date: '2025-06-04', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 7, date: '2025-07-02', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 8, date: '2025-09-01', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 9, date: '2025-10-03', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 10, date: '2025-11-03', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 11, date: '2025-12-03', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 12, date: '2026-01-02', description: 'Acme Cloud', normalized_merchant: 'Acme Cloud', amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    // 11 distinct months but span is ~12 months — use span so drift doesn't inflate
    // $600 / 12 = $50, not $600 / 11 = $54.55
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(50.00)
    expect(groups[0].estimatedMonthlyAmount).not.toBeGreaterThan(50)
  })

  it('calculates monthly cost correctly with multiple charges per month', () => {
    const transactions = [
      { id: 1, date: '2025-01-05', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-01-12', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-01-19', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-02-05', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 5, date: '2025-02-12', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 6, date: '2025-02-19', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 7, date: '2025-03-05', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 8, date: '2025-03-12', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 9, date: '2025-03-19', description: 'Acme Gym', normalized_merchant: 'Acme Gym', amount: 25.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    // 9 × $25 = $225 over 3 months = $75/mo (not $25 per-transaction avg)
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(75.00)
    expect(groups[0].avgAmount).toBeCloseTo(25.00)
  })

  it('skips transactions with null normalized_merchant', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Unknown', normalized_merchant: null, amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Unknown', normalized_merchant: null, amount: 50.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })
})
