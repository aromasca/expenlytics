import OpenAI from 'openai'
import type { LLMProvider, LLMRequest, LLMDocumentRequest, LLMResponse } from '../types'

// Typed interfaces for OpenAI Responses API (not fully covered by SDK types)
interface ResponsesAPIInput {
  role: 'system' | 'user'
  content: Array<{ type: string; text?: string; file_id?: string }>
}

interface ResponsesAPIOutputContent {
  type: string
  text?: string
}

interface ResponsesAPIOutput {
  content?: ResponsesAPIOutputContent[]
}

interface ResponsesAPIResult {
  output?: ResponsesAPIOutput[]
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ timeout: 120_000 })
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    if (request.system) {
      messages.push({ role: 'system', content: request.system })
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content })
    }

    const MAX_RETRIES = 2
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await this.client.chat.completions.create({
        model: request.model,
        max_completion_tokens: request.maxTokens,
        messages,
      })

      const choice = response.choices[0]
      const text = choice?.message?.content ?? ''
      const finishReason = choice?.finish_reason

      if (text.trim()) {
        return { text }
      }

      // Empty response — log diagnostics
      const refusal = (choice?.message as unknown as Record<string, unknown>)?.refusal
      console.warn(`[openai] Empty response from ${request.model} (finish_reason: ${finishReason}, refusal: ${refusal ?? 'none'}, attempt ${attempt + 1}/${MAX_RETRIES + 1})`)

      if (finishReason === 'length') {
        throw new Error(`OpenAI ${request.model} hit token limit (max_completion_tokens: ${request.maxTokens}) — try a larger limit or smaller input`)
      }

      if (refusal) {
        throw new Error(`OpenAI ${request.model} refused the request: ${refusal}`)
      }

      // Retry on empty response (transient issue)
      if (attempt < MAX_RETRIES) {
        const delay = (attempt + 1) * 1000
        console.log(`[openai] Retrying in ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
      }
    }

    throw new Error(`OpenAI ${request.model} returned empty response after ${MAX_RETRIES + 1} attempts`)
  }

  async extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse> {
    // Step 1: Upload PDF via Files API
    console.log(`[openai] Uploading PDF (${(request.document.length / 1024).toFixed(0)}KB)...`)
    const t0 = Date.now()
    const file = await this.client.files.create({
      file: new File([new Uint8Array(request.document)], 'document.pdf', { type: request.documentMediaType }),
      purpose: 'user_data',
    })
    console.log(`[openai] File uploaded: ${file.id} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

    const userMessage = request.messages.find(m => m.role === 'user')

    const input: ResponsesAPIInput[] = []

    if (request.system) {
      input.push({
        role: 'system',
        content: [{ type: 'input_text', text: request.system }],
      })
    }

    input.push({
      role: 'user',
      content: [
        { type: 'input_file', file_id: file.id },
        { type: 'input_text', text: userMessage?.content ?? '' },
      ],
    })

    // Step 2: Call Responses API (this is the slow part — OpenAI processes the PDF server-side)
    console.log(`[openai] Calling responses API (model: ${request.model})... this may take a while for PDFs`)
    const t1 = Date.now()
    // Responses API input shape isn't fully typed in the SDK yet
    const response = await this.client.responses.create({
      model: request.model,
      input,
    } as Parameters<typeof this.client.responses.create>[0])
    console.log(`[openai] Response received (${((Date.now() - t1) / 1000).toFixed(1)}s)`)

    // Extract text from response output
    const resp = response as unknown as ResponsesAPIResult
    const text = (resp.output || [])
      .flatMap((item) => item.content || [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text ?? '')
      .join('\n')

    return { text }
  }
}
