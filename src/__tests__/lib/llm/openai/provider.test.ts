import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCompletionsCreate = vi.fn()
const mockFilesCreate = vi.fn()
const mockResponsesCreate = vi.fn()

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCompletionsCreate } }
    files = { create: mockFilesCreate }
    responses = { create: mockResponsesCreate }
  },
}))

import { OpenAIProvider } from '@/lib/llm/openai/provider'
import type { LLMRequest, LLMDocumentRequest } from '@/lib/llm/types'

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    mockCompletionsCreate.mockReset()
    mockFilesCreate.mockReset()
    mockResponsesCreate.mockReset()
    provider = new OpenAIProvider()
  })

  describe('complete', () => {
    it('maps LLMRequest to OpenAI chat completions', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: '{"result": true}' }, finish_reason: 'stop' }],
      })

      const request: LLMRequest = {
        system: 'You are a helper',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 4096,
        model: 'gpt-4o',
      }

      const response = await provider.complete(request)

      expect(response.text).toBe('{"result": true}')
      expect(mockCompletionsCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        max_completion_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are a helper' },
          { role: 'user', content: 'Hello' },
        ],
      })
    })

    it('omits system message when not provided', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      })

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 1024,
        model: 'gpt-4o-mini',
      })

      const callArgs = mockCompletionsCreate.mock.calls[0][0]
      expect(callArgs.messages).toEqual([{ role: 'user', content: 'Hi' }])
    })

    it('retries on empty response then succeeds', async () => {
      // First call returns empty, second returns valid content
      let callCount = 0
      mockCompletionsCreate.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })
        }
        return Promise.resolve({ choices: [{ message: { content: '{"ok": true}' }, finish_reason: 'stop' }] })
      })

      // Override setTimeout to be instant
      const origSetTimeout = globalThis.setTimeout
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout

      try {
        const response = await provider.complete({
          messages: [{ role: 'user', content: 'Test' }],
          maxTokens: 1024,
          model: 'gpt-4o',
        })
        expect(response.text).toBe('{"ok": true}')
        expect(callCount).toBe(2)
      } finally {
        globalThis.setTimeout = origSetTimeout
      }
    })

    it('throws after all retries return empty', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
      })

      const origSetTimeout = globalThis.setTimeout
      globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof globalThis.setTimeout

      try {
        await expect(provider.complete({
          messages: [{ role: 'user', content: 'Test' }],
          maxTokens: 1024,
          model: 'gpt-5-nano',
        })).rejects.toThrow('empty response after 3 attempts')
      } finally {
        globalThis.setTimeout = origSetTimeout
      }
    })

    it('throws immediately on token length limit', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: '' }, finish_reason: 'length' }],
      })

      await expect(provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
        maxTokens: 100,
        model: 'gpt-4o',
      })).rejects.toThrow('hit token limit')
    })
  })

  describe('extractFromDocument', () => {
    it('uploads PDF then uses responses API with file reference', async () => {
      mockFilesCreate.mockResolvedValue({ id: 'file-abc123' })
      mockResponsesCreate.mockResolvedValue({
        output: [
          {
            content: [{ type: 'output_text', text: '{"transactions": []}' }],
          },
        ],
      })

      const pdfBuffer = Buffer.from('fake-pdf-bytes')
      const request: LLMDocumentRequest = {
        messages: [{ role: 'user', content: 'Extract transactions' }],
        maxTokens: 16384,
        model: 'gpt-4o',
        document: pdfBuffer,
        documentMediaType: 'application/pdf',
      }

      const response = await provider.extractFromDocument(request)

      expect(response.text).toBe('{"transactions": []}')

      // Verify file upload
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'user_data' })
      )

      // Verify responses API call with file reference
      expect(mockResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'input_file', file_id: 'file-abc123' }),
                expect.objectContaining({ type: 'input_text', text: 'Extract transactions' }),
              ]),
            }),
          ]),
        })
      )
    })

    it('includes system message in responses API call when provided', async () => {
      mockFilesCreate.mockResolvedValue({ id: 'file-xyz' })
      mockResponsesCreate.mockResolvedValue({
        output: [{ content: [{ type: 'output_text', text: 'result' }] }],
      })

      const pdfBuffer = Buffer.from('fake-pdf')
      await provider.extractFromDocument({
        system: 'You are an extractor',
        messages: [{ role: 'user', content: 'Extract' }],
        maxTokens: 8192,
        model: 'gpt-4o',
        document: pdfBuffer,
        documentMediaType: 'application/pdf',
      })

      const callArgs = mockResponsesCreate.mock.calls[0][0]
      const systemInput = callArgs.input.find((i: Record<string, unknown>) => i.role === 'system')
      expect(systemInput).toBeDefined()
      expect(systemInput.content).toEqual([{ type: 'input_text', text: 'You are an extractor' }])
    })
  })
})
