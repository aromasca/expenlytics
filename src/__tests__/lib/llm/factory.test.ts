import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { setSetting } from '@/lib/db/settings'

// Mock the provider constructors so we don't need real API keys
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {},
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {},
}))

import { getProviderForTask } from '@/lib/llm/factory'

describe('getProviderForTask', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('returns anthropic provider by default', () => {
    const result = getProviderForTask(db, 'extraction')
    expect(result.providerName).toBe('anthropic')
    expect(result.model).toBe('claude-sonnet-4-5-20250929')
    expect(result.provider).toBeDefined()
    expect(result.provider.complete).toBeDefined()
    expect(result.provider.extractFromDocument).toBeDefined()
  })

  it('reads provider from settings', () => {
    setSetting(db, 'provider_extraction', 'openai')
    const result = getProviderForTask(db, 'extraction')
    expect(result.providerName).toBe('openai')
    expect(result.model).toBe('gpt-5')
  })

  it('reads model from settings', () => {
    setSetting(db, 'model_extraction', 'claude-haiku-4-5-20251001')
    const result = getProviderForTask(db, 'extraction')
    expect(result.model).toBe('claude-haiku-4-5-20251001')
  })

  it('uses provider default model when provider changes but model not set', () => {
    setSetting(db, 'provider_normalization', 'openai')
    const result = getProviderForTask(db, 'normalization')
    expect(result.providerName).toBe('openai')
    expect(result.model).toBe('gpt-5-mini')
  })

  it('falls back to provider default if saved model does not belong to provider', () => {
    setSetting(db, 'provider_extraction', 'openai')
    setSetting(db, 'model_extraction', 'claude-sonnet-4-5-20250929')
    const result = getProviderForTask(db, 'extraction')
    expect(result.model).toBe('gpt-5')
  })

  it('ignores invalid provider setting and defaults to anthropic', () => {
    setSetting(db, 'provider_extraction', 'invalid-provider')
    const result = getProviderForTask(db, 'extraction')
    expect(result.providerName).toBe('anthropic')
  })
})
