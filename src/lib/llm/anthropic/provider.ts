import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMRequest, LLMDocumentRequest, LLMResponse } from '../types'

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic()
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: request.messages,
      ...(request.system ? { system: request.system } : {}),
    }

    const response = await this.client.messages.create(params)
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { text }
  }

  async extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse> {
    const userMessage = request.messages.find(m => m.role === 'user')
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: request.documentMediaType as 'application/pdf',
          data: request.document.toString('base64'),
        },
      },
      { type: 'text', text: userMessage?.content ?? '' },
    ]

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: [{ role: 'user', content }],
      ...(request.system ? { system: request.system } : {}),
    }

    const response = await this.client.messages.create(params)
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { text }
  }
}
