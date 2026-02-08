import { describe, it, expect } from 'vitest'
import { detectRecurringGroups } from '@/lib/recurring'

describe('detectRecurringGroups', () => {
  it('groups transactions by normalized_merchant', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'NETFLIX.COM 1234', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Streaming Services', category_color: '#0EA5E9' },
      { id: 2, date: '2025-02-15', description: 'NETFLIX.COM 5678', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: 'Streaming Services', category_color: '#0EA5E9' },
      { id: 3, date: '2025-01-20', description: 'Whole Foods', normalized_merchant: 'Whole Foods Market', amount: 85.00, type: 'debit' as const, category_name: 'Groceries', category_color: '#22C55E' },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(1)
    expect(groups[0].merchantName).toBe('Netflix')
    expect(groups[0].occurrences).toBe(2)
    expect(groups[0].totalAmount).toBeCloseTo(31.98)
    expect(groups[0].avgAmount).toBeCloseTo(15.99)
  })

  it('requires at least 2 occurrences', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'NETFLIX.COM', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
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

  it('excludes charges with highly varying amounts (not a subscription)', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'TJ 1', normalized_merchant: "Trader Joe's", amount: 45.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'TJ 2', normalized_merchant: "Trader Joe's", amount: 92.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-03-15', description: 'TJ 3', normalized_merchant: "Trader Joe's", amount: 38.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups).toHaveLength(0)
  })

  it('includes charges with consistent amounts (real subscription)', () => {
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
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].frequency).toBe('yearly')
    expect(groups[0].estimatedMonthlyAmount).toBeCloseTo(139.00 / 12)
  })

  it('sorts groups by total amount descending', () => {
    const transactions = [
      { id: 1, date: '2025-01-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 2, date: '2025-02-15', description: 'Cheap', normalized_merchant: 'Cheap SaaS', amount: 5.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 3, date: '2025-01-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
      { id: 4, date: '2025-02-15', description: 'Expensive', normalized_merchant: 'Expensive SaaS', amount: 99.00, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].merchantName).toBe('Expensive SaaS')
    expect(groups[1].merchantName).toBe('Cheap SaaS')
  })

  it('includes transaction IDs, first and last dates', () => {
    const transactions = [
      { id: 10, date: '2025-01-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
      { id: 20, date: '2025-03-15', description: 'Netflix', normalized_merchant: 'Netflix', amount: 15.99, type: 'debit' as const, category_name: null, category_color: null },
    ]

    const groups = detectRecurringGroups(transactions)
    expect(groups[0].transactionIds).toEqual([10, 20])
    expect(groups[0].firstDate).toBe('2025-01-15')
    expect(groups[0].lastDate).toBe('2025-03-15')
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
