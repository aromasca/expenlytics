import { describe, it, expect } from 'vitest'
import { PROVIDERS, getProviderConfig, isValidProvider, isModelValidForProvider, VALID_PROVIDER_NAMES } from '@/lib/llm/config'

describe('provider config', () => {
  it('has anthropic and openai providers', () => {
    expect(PROVIDERS.anthropic).toBeDefined()
    expect(PROVIDERS.openai).toBeDefined()
  })

  it('each provider has required fields', () => {
    for (const [, config] of Object.entries(PROVIDERS)) {
      expect(config.name).toBeTruthy()
      expect(config.envKey).toBeTruthy()
      expect(config.models.length).toBeGreaterThan(0)
      expect(config.defaults.extraction).toBeTruthy()
      expect(config.defaults.classification).toBeTruthy()
      expect(config.defaults.normalization).toBeTruthy()
      expect(config.defaults.insights).toBeTruthy()
    }
  })

  it('getProviderConfig returns config for valid provider', () => {
    const config = getProviderConfig('anthropic')
    expect(config.name).toBe('Anthropic')
  })

  it('getProviderConfig throws for invalid provider', () => {
    expect(() => getProviderConfig('invalid' as never)).toThrow()
  })

  it('each model id is unique across all providers', () => {
    const allIds = Object.values(PROVIDERS).flatMap(p => p.models.map(m => m.id))
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('default models exist in their provider model list', () => {
    for (const [, config] of Object.entries(PROVIDERS)) {
      const modelIds = config.models.map(m => m.id)
      for (const [, defaultModel] of Object.entries(config.defaults)) {
        expect(modelIds).toContain(defaultModel)
      }
    }
  })

  it('isValidProvider returns true for valid providers', () => {
    expect(isValidProvider('anthropic')).toBe(true)
    expect(isValidProvider('openai')).toBe(true)
    expect(isValidProvider('invalid')).toBe(false)
  })

  it('isModelValidForProvider checks model belongs to provider', () => {
    expect(isModelValidForProvider('anthropic', 'claude-sonnet-4-5-20250929')).toBe(true)
    expect(isModelValidForProvider('anthropic', 'gpt-4o')).toBe(false)
    expect(isModelValidForProvider('openai', 'gpt-4o')).toBe(true)
    expect(isModelValidForProvider('openai', 'claude-sonnet-4-5-20250929')).toBe(false)
  })

  it('VALID_PROVIDER_NAMES lists all providers', () => {
    expect(VALID_PROVIDER_NAMES).toContain('anthropic')
    expect(VALID_PROVIDER_NAMES).toContain('openai')
  })
})
