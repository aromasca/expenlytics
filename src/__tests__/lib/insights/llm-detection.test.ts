import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
  }
  return { default: MockAnthropic }
})

const { detectLLMInsights } = await import('@/lib/insights/detection')

function createDb() {
  const db = new Database(':memory:')
  initializeSchema(db)
  return db
}

function getCategoryId(db: Database.Database, name: string): number {
  return (db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as { id: number }).id
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function seedTransactions(db: Database.Database, count: number) {
  const catId = getCategoryId(db, 'Groceries')
  for (let i = 0; i < count; i++) {
    db.prepare(`INSERT INTO documents (filename, filepath, status, file_hash) VALUES ('t.pdf', '/t.pdf', 'completed', 'h-' || ?)`).run(i)
    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id
    db.prepare('INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(docId, monthsAgo(i % 3), `Store ${i}`, 50 + i, 'debit', catId)
  }
}

const validLLMResponse = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      insights: [{
        headline: 'Grocery spending is climbing',
        category: 'Groceries',
        severity: 'concerning',
        key_metric: '+$100/mo',
        explanation: 'Your grocery spend has increased steadily.',
        evidence: { category_a: 'Groceries', merchant_names: [] },
      }],
    }),
  }],
}

describe('detectLLMInsights', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns empty array when fewer than 30 transactions', async () => {
    const db = createDb()
    seedTransactions(db, 10)
    const result = await detectLLMInsights(db)
    expect(result).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls LLM and returns mapped InsightCards', async () => {
    const db = createDb()
    seedTransactions(db, 35)
    mockCreate.mockResolvedValueOnce(validLLMResponse)

    const result = await detectLLMInsights(db)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('llm_insight')
    expect(result[0].headline).toBe('Grocery spending is climbing')
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('returns cached results on second call', async () => {
    const db = createDb()
    seedTransactions(db, 35)
    mockCreate.mockResolvedValueOnce(validLLMResponse)

    await detectLLMInsights(db)
    const result2 = await detectLLMInsights(db)

    expect(result2).toHaveLength(1)
    expect(mockCreate).toHaveBeenCalledOnce() // not called again
  })

  it('returns empty array when LLM call throws', async () => {
    const db = createDb()
    seedTransactions(db, 35)
    mockCreate.mockRejectedValueOnce(new Error('API key missing'))

    await expect(detectLLMInsights(db)).rejects.toThrow('API key missing')
  })
})
