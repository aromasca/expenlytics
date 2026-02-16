import { describe, it, expect } from 'vitest'
import type { LLMProvider, LLMRequest, LLMDocumentRequest, LLMResponse } from '@/lib/llm/types'

describe('LLM types', () => {
  it('LLMProvider interface is structurally valid', () => {
    const mockProvider: LLMProvider = {
      complete: async (_req: LLMRequest): Promise<LLMResponse> => ({ text: 'test' }),
      extractFromDocument: async (_req: LLMDocumentRequest): Promise<LLMResponse> => ({ text: 'test' }),
    }
    expect(mockProvider.complete).toBeDefined()
    expect(mockProvider.extractFromDocument).toBeDefined()
  })
})
