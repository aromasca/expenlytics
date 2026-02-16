export interface LLMRequest {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
  model: string
}

export interface LLMDocumentRequest extends LLMRequest {
  document: Buffer
  documentMediaType: string
}

export interface LLMResponse {
  text: string
}

export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>
  extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse>
}

export type ProviderName = 'anthropic' | 'openai'

export type TaskName = 'extraction' | 'classification' | 'normalization' | 'insights' | 'merge_suggestions'

export interface PromptTemplate {
  system?: string
  user: string
}
