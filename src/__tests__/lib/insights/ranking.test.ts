import { describe, it, expect } from 'vitest'
import { scoreRecency, scoreMagnitude, scoreSeverity, rankInsights } from '@/lib/insights/ranking'
import type { InsightCard } from '@/lib/insights/types'

describe('scoreRecency', () => {
  it('scores recent data highest', () => {
    expect(scoreRecency(15)).toBe(40)
    expect(scoreRecency(45)).toBe(30)
    expect(scoreRecency(75)).toBe(20)
    expect(scoreRecency(120)).toBe(10)
  })
})

describe('scoreMagnitude', () => {
  it('scores large changes highest', () => {
    expect(scoreMagnitude(60, 600)).toBe(40)
    expect(scoreMagnitude(5, 30)).toBe(10)
  })
})

describe('scoreSeverity', () => {
  it('scores concerning highest', () => {
    expect(scoreSeverity('concerning')).toBe(20)
    expect(scoreSeverity('favorable')).toBe(5)
  })
})

describe('rankInsights', () => {
  it('filters out low-score insights', () => {
    const insights: InsightCard[] = [
      { id: 'a', type: 'category_trend', severity: 'favorable', headline: '', metric: '', percentChange: 5, dollarChange: 10, score: 20, sparkline: [] },
      { id: 'b', type: 'category_trend', severity: 'concerning', headline: '', metric: '', percentChange: 50, dollarChange: 500, score: 80, sparkline: [] },
    ]
    const ranked = rankInsights(insights)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('b')
  })

  it('sorts by score descending', () => {
    const insights: InsightCard[] = [
      { id: 'low', type: 'category_trend', severity: 'notable', headline: '', metric: '', percentChange: 30, dollarChange: 300, score: 50, sparkline: [] },
      { id: 'high', type: 'category_trend', severity: 'concerning', headline: '', metric: '', percentChange: 60, dollarChange: 600, score: 90, sparkline: [] },
    ]
    const ranked = rankInsights(insights)
    expect(ranked[0].id).toBe('high')
  })
})
