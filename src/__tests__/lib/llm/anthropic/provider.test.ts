import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { AnthropicProvider } from '@/lib/llm/anthropic/provider'
import type { LLMRequest, LLMDocumentRequest } from '@/lib/llm/types'

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    mockCreate.mockReset()
    provider = new AnthropicProvider()
  })

  describe('complete', () => {
    it('maps LLMRequest to Anthropic messages.create', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"result": true}' }],
      })

      const request: LLMRequest = {
        system: 'You are a helper',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 4096,
        model: 'claude-haiku-4-5-20251001',
      }

      const response = await provider.complete(request)

      expect(response.text).toBe('{"result": true}')
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: 'You are a helper',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    })

    it('omits system when not provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      })

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 1024,
        model: 'claude-haiku-4-5-20251001',
      })

      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.system).toBeUndefined()
    })
  })

  describe('extractFromDocument', () => {
    it('sends PDF as document content block', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"transactions": []}' }],
      })

      const pdfBuffer = Buffer.from('fake-pdf-bytes')
      const request: LLMDocumentRequest = {
        system: undefined,
        messages: [{ role: 'user', content: 'Extract transactions' }],
        maxTokens: 16384,
        model: 'claude-sonnet-4-5-20250929',
        document: pdfBuffer,
        documentMediaType: 'application/pdf',
      }

      const response = await provider.extractFromDocument(request)

      expect(response.text).toBe('{"transactions": []}')
      const callArgs = mockCreate.mock.calls[0][0]
      expect(callArgs.messages[0].content).toEqual([
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        { type: 'text', text: 'Extract transactions' },
      ])
    })
  })
})
