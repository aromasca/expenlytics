import { describe, it, expect } from 'vitest'
import type { LLMProvider, LLMResponse } from '@/lib/llm/types'

describe('LLM types', () => {
  it('LLMProvider interface is structurally valid', () => {
    const mockProvider: LLMProvider = {
      complete: async () => ({ text: 'test' }) as LLMResponse,
      extractFromDocument: async () => ({ text: 'test' }) as LLMResponse,
    }
    expect(mockProvider.complete).toBeDefined()
    expect(mockProvider.extractFromDocument).toBeDefined()
  })
})
