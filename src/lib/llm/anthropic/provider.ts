import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMRequest, LLMDocumentRequest, LLMResponse } from '../types'

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic()
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const params: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: request.messages,
    }
    if (request.system) {
      params.system = request.system
    }

    const response = await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { text }
  }

  async extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse> {
    const userMessage = request.messages.find(m => m.role === 'user')
    const content = [
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: request.documentMediaType,
          data: request.document.toString('base64'),
        },
      },
      { type: 'text' as const, text: userMessage?.content ?? '' },
    ]

    const params: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: [{ role: 'user', content }],
    }
    if (request.system) {
      params.system = request.system
    }

    const response = await this.client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming)
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { text }
  }
}
