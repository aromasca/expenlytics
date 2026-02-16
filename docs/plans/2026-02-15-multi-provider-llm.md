# Multi-Provider LLM Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded Anthropic SDK integration with a provider adapter pattern supporting Anthropic + OpenAI, with per-task provider/model selection.

**Architecture:** Provider adapter pattern — `LLMProvider` interface with `complete()` and `extractFromDocument()` methods. Anthropic and OpenAI adapters. Provider-specific prompt variants. Factory reads provider+model from settings table per task. `src/lib/claude/` → `src/lib/llm/`.

**Tech Stack:** `@anthropic-ai/sdk` (existing), `openai` (new), Zod (existing), better-sqlite3 (existing)

---

### Task 1: Install OpenAI SDK

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install openai`

**Step 2: Verify installation**

Run: `npm ls openai`
Expected: `openai@x.x.x` listed

**Step 3: Add to Next.js server external packages**

Modify `next.config.ts` — add `'openai'` to `serverExternalPackages` alongside `'better-sqlite3'`:

```typescript
serverExternalPackages: ['better-sqlite3', 'openai'],
```

**Step 4: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: install openai SDK"
```

---

### Task 2: Create Provider Types

**Files:**
- Create: `src/lib/llm/types.ts`
- Test: `src/__tests__/lib/llm/types.test.ts`

**Step 1: Write the type test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/llm/types.test.ts`
Expected: FAIL — module not found

**Step 3: Write the types**

```typescript
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

export type TaskName = 'extraction' | 'classification' | 'normalization' | 'insights'
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/llm/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/types.ts" "src/__tests__/lib/llm/types.test.ts"
git commit -m "feat: add LLMProvider interface and types"
```

---

### Task 3: Create Provider Config

**Files:**
- Create: `src/lib/llm/config.ts`
- Test: `src/__tests__/lib/llm/config.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { PROVIDERS, getProviderConfig, getAvailableProviders } from '@/lib/llm/config'

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
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/llm/config.test.ts`
Expected: FAIL — module not found

**Step 3: Write the config**

```typescript
import type { ProviderName, TaskName } from './types'

export interface ModelInfo {
  id: string
  name: string
}

export interface ProviderConfig {
  name: string
  envKey: string
  models: ModelInfo[]
  defaults: Record<TaskName, string>
}

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  anthropic: {
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    defaults: {
      extraction: 'claude-sonnet-4-5-20250929',
      classification: 'claude-sonnet-4-5-20250929',
      normalization: 'claude-haiku-4-5-20251001',
      insights: 'claude-haiku-4-5-20251001',
    },
  },
  openai: {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-5', name: 'GPT-5' },
    ],
    defaults: {
      extraction: 'gpt-4o',
      classification: 'gpt-4o',
      normalization: 'gpt-4o-mini',
      insights: 'gpt-4o-mini',
    },
  },
}

export const VALID_PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[]

export function getProviderConfig(provider: ProviderName): ProviderConfig {
  const config = PROVIDERS[provider]
  if (!config) throw new Error(`Unknown provider: ${provider}`)
  return config
}

export function isValidProvider(name: string): name is ProviderName {
  return name in PROVIDERS
}

export function getAvailableProviders(): ProviderName[] {
  return VALID_PROVIDER_NAMES.filter(name => {
    const config = PROVIDERS[name]
    return !!process.env[config.envKey]
  })
}

export function isModelValidForProvider(provider: ProviderName, modelId: string): boolean {
  const config = PROVIDERS[provider]
  return config.models.some(m => m.id === modelId)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/llm/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/config.ts" "src/__tests__/lib/llm/config.test.ts"
git commit -m "feat: add multi-provider config with Anthropic and OpenAI"
```

---

### Task 4: Create Anthropic Provider

**Files:**
- Create: `src/lib/llm/anthropic/provider.ts`
- Test: `src/__tests__/lib/llm/anthropic/provider.test.ts`

**Step 1: Write the test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- "src/__tests__/lib/llm/anthropic/provider.test.ts"`
Expected: FAIL — module not found

**Step 3: Write the Anthropic provider**

```typescript
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

    const response = await this.client.messages.create(params as Anthropic.MessageCreateParams)
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

    const response = await this.client.messages.create(params as Anthropic.MessageCreateParams)
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { text }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- "src/__tests__/lib/llm/anthropic/provider.test.ts"`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/anthropic/provider.ts" "src/__tests__/lib/llm/anthropic/provider.test.ts"
git commit -m "feat: add Anthropic LLM provider adapter"
```

---

### Task 5: Create OpenAI Provider

**Files:**
- Create: `src/lib/llm/openai/provider.ts`
- Test: `src/__tests__/lib/llm/openai/provider.test.ts`

**Step 1: Write the test**

```typescript
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
        choices: [{ message: { content: '{"result": true}' } }],
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
        max_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are a helper' },
          { role: 'user', content: 'Hello' },
        ],
      })
    })

    it('omits system message when not provided', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      })

      await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 1024,
        model: 'gpt-4o-mini',
      })

      const callArgs = mockCompletionsCreate.mock.calls[0][0]
      expect(callArgs.messages).toEqual([{ role: 'user', content: 'Hi' }])
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
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'user_data' })
      )
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
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- "src/__tests__/lib/llm/openai/provider.test.ts"`
Expected: FAIL — module not found

**Step 3: Write the OpenAI provider**

Note: The `extractFromDocument` method needs to create a `File` object from the buffer for the OpenAI SDK's `files.create`. Use `new File([buffer], 'document.pdf', { type: mediaType })`.

```typescript
import OpenAI from 'openai'
import type { LLMProvider, LLMRequest, LLMDocumentRequest, LLMResponse } from '../types'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI()
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    if (request.system) {
      messages.push({ role: 'system', content: request.system })
    }
    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content })
    }

    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      messages,
    })

    const text = response.choices[0]?.message?.content ?? ''
    return { text }
  }

  async extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse> {
    // Upload PDF via Files API
    const file = await this.client.files.create({
      file: new File([request.document], 'document.pdf', { type: request.documentMediaType }),
      purpose: 'user_data',
    })

    const userMessage = request.messages.find(m => m.role === 'user')

    const input: Array<Record<string, unknown>> = []

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

    const response = await this.client.responses.create({
      model: request.model,
      input,
    } as Parameters<typeof this.client.responses.create>[0])

    // Extract text from response output
    const text = ((response.output || []) as Array<Record<string, unknown>>)
      .flatMap((item) => (item.content || []) as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text as string)
      .join('\n')

    return { text }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- "src/__tests__/lib/llm/openai/provider.test.ts"`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/openai/provider.ts" "src/__tests__/lib/llm/openai/provider.test.ts"
git commit -m "feat: add OpenAI LLM provider adapter"
```

---

### Task 6: Create Provider Factory

**Files:**
- Create: `src/lib/llm/factory.ts`
- Test: `src/__tests__/lib/llm/factory.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { setSetting } from '@/lib/db/settings'
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
    expect(result.model).toBe('gpt-4o') // openai default for extraction
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
    expect(result.model).toBe('gpt-4o-mini') // openai default for normalization
  })

  it('falls back to provider default if saved model does not belong to provider', () => {
    setSetting(db, 'provider_extraction', 'openai')
    setSetting(db, 'model_extraction', 'claude-sonnet-4-5-20250929') // anthropic model, wrong provider
    const result = getProviderForTask(db, 'extraction')
    expect(result.model).toBe('gpt-4o') // falls back to openai default
  })

  it('ignores invalid provider setting and defaults to anthropic', () => {
    setSetting(db, 'provider_extraction', 'invalid-provider')
    const result = getProviderForTask(db, 'extraction')
    expect(result.providerName).toBe('anthropic')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- "src/__tests__/lib/llm/factory.test.ts"`
Expected: FAIL — module not found

**Step 3: Write the factory**

```typescript
import type { LLMProvider, ProviderName, TaskName } from './types'
import { PROVIDERS, isValidProvider, isModelValidForProvider } from './config'
import { AnthropicProvider } from './anthropic/provider'
import { OpenAIProvider } from './openai/provider'
import { getSetting } from '@/lib/db/settings'
import type Database from 'better-sqlite3'

const TASK_SETTINGS_KEYS: Record<TaskName, { provider: string; model: string }> = {
  extraction: { provider: 'provider_extraction', model: 'model_extraction' },
  classification: { provider: 'provider_classification', model: 'model_classification' },
  normalization: { provider: 'provider_normalization', model: 'model_normalization' },
  insights: { provider: 'provider_insights', model: 'model_insights' },
}

const DEFAULT_PROVIDER: ProviderName = 'anthropic'

function createProvider(name: ProviderName): LLMProvider {
  switch (name) {
    case 'anthropic': return new AnthropicProvider()
    case 'openai': return new OpenAIProvider()
    default: throw new Error(`Unknown provider: ${name}`)
  }
}

export interface ProviderForTask {
  provider: LLMProvider
  providerName: ProviderName
  model: string
}

export function getProviderForTask(db: Database.Database, task: TaskName): ProviderForTask {
  const keys = TASK_SETTINGS_KEYS[task]

  // Resolve provider
  const savedProvider = getSetting(db, keys.provider)
  const providerName: ProviderName =
    savedProvider && isValidProvider(savedProvider) ? savedProvider : DEFAULT_PROVIDER
  const providerConfig = PROVIDERS[providerName]

  // Resolve model
  const savedModel = getSetting(db, keys.model)
  const model =
    savedModel && isModelValidForProvider(providerName, savedModel)
      ? savedModel
      : providerConfig.defaults[task]

  return {
    provider: createProvider(providerName),
    providerName,
    model,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- "src/__tests__/lib/llm/factory.test.ts"`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/factory.ts" "src/__tests__/lib/llm/factory.test.ts"
git commit -m "feat: add provider factory with per-task provider/model selection"
```

---

### Task 7: Extract Anthropic Prompts

Move all prompt strings from `src/lib/claude/extract-transactions.ts`, `normalize-merchants.ts`, and `analyze-finances.ts` into `src/lib/llm/prompts/` as Anthropic-specific variants. These are the current production prompts — this task just relocates them.

**Files:**
- Create: `src/lib/llm/prompts/extraction.ts`
- Create: `src/lib/llm/prompts/classification.ts`
- Create: `src/lib/llm/prompts/normalization.ts`
- Create: `src/lib/llm/prompts/insights.ts`
- Test: `src/__tests__/lib/llm/prompts/prompts.test.ts`

**Step 1: Write tests for prompt getters**

```typescript
import { describe, it, expect } from 'vitest'
import { getRawExtractionPrompt, getLegacyExtractionPrompt } from '@/lib/llm/prompts/extraction'
import { getClassifyPrompt, getReclassifyPrompt } from '@/lib/llm/prompts/classification'
import { getNormalizationPrompt } from '@/lib/llm/prompts/normalization'
import { getHealthAndPatternsPrompt, getDeepInsightsPrompt } from '@/lib/llm/prompts/insights'
import type { ProviderName } from '@/lib/llm/types'

const providers: ProviderName[] = ['anthropic', 'openai']

describe('prompt getters', () => {
  for (const provider of providers) {
    describe(`${provider} provider`, () => {
      it('getRawExtractionPrompt returns user prompt', () => {
        const prompt = getRawExtractionPrompt(provider)
        expect(prompt.user).toBeTruthy()
        expect(prompt.user.length).toBeGreaterThan(100)
      })

      it('getClassifyPrompt returns user prompt with placeholders', () => {
        const prompt = getClassifyPrompt(provider)
        expect(prompt.user).toContain('{document_type}')
        expect(prompt.user).toContain('{transactions_json}')
      })

      it('getNormalizationPrompt returns user prompt with placeholders', () => {
        const prompt = getNormalizationPrompt(provider)
        expect(prompt.user).toContain('{descriptions_json}')
      })

      it('getHealthAndPatternsPrompt returns system and user', () => {
        const prompt = getHealthAndPatternsPrompt(provider)
        expect(prompt.system).toBeTruthy()
        expect(prompt.user).toContain('{summary_stats}')
        expect(prompt.user).toContain('{data_json}')
      })

      it('getDeepInsightsPrompt returns system and user', () => {
        const prompt = getDeepInsightsPrompt(provider)
        expect(prompt.system).toBeTruthy()
        expect(prompt.user).toContain('{summary_stats}')
        expect(prompt.user).toContain('{data_json}')
      })
    })
  }
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- "src/__tests__/lib/llm/prompts/prompts.test.ts"`
Expected: FAIL — modules not found

**Step 3: Create prompt files**

For each prompt file:
- Move the existing prompt strings from `src/lib/claude/*.ts` as the `'anthropic'` variant
- Create an `'openai'` variant adapted for GPT models (markdown headers instead of XML-style tags, more direct instruction framing, same content/rules)
- Export a getter function: `getXxxPrompt(provider: ProviderName): { system?: string, user: string }`

**`src/lib/llm/prompts/extraction.ts`:**
- Move `RAW_EXTRACTION_PROMPT` (lines 12-66 of extract-transactions.ts) → `anthropic` variant of `getRawExtractionPrompt`
- Move `EXTRACTION_PROMPT` (lines 68-245) → `anthropic` variant of `getLegacyExtractionPrompt`
- Create OpenAI variants with same rules, adapted style

**`src/lib/llm/prompts/classification.ts`:**
- Move `CLASSIFY_PROMPT` (lines 414-483) → `anthropic` variant of `getClassifyPrompt`
- Move `RECLASSIFY_PROMPT` (lines 344-412) → `anthropic` variant of `getReclassifyPrompt`
- Create OpenAI variants

**`src/lib/llm/prompts/normalization.ts`:**
- Move `NORMALIZATION_PROMPT` (lines 4-27 of normalize-merchants.ts) → `anthropic` variant
- Create OpenAI variant

**`src/lib/llm/prompts/insights.ts`:**
- Move `HEALTH_AND_PATTERNS_SYSTEM` + `HEALTH_AND_PATTERNS_USER` (lines 6-61 of analyze-finances.ts) → `anthropic` variant
- Move `DEEP_INSIGHTS_SYSTEM` + `DEEP_INSIGHTS_USER` (lines 63-113) → `anthropic` variant
- Create OpenAI variants

Each prompt getter function pattern:
```typescript
const PROMPTS: Record<ProviderName, { system?: string; user: string }> = {
  anthropic: { user: `...existing prompt text...` },
  openai: { user: `...adapted prompt text...` },
}

export function getXxxPrompt(provider: ProviderName): { system?: string; user: string } {
  return PROMPTS[provider]
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- "src/__tests__/lib/llm/prompts/prompts.test.ts"`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/prompts/" "src/__tests__/lib/llm/prompts/"
git commit -m "feat: extract prompts with Anthropic and OpenAI variants"
```

---

### Task 8: Refactor Caller Functions to Use Provider Abstraction

Refactor the three LLM function files to accept `LLMProvider` + `providerName` + `model` instead of creating `new Anthropic()` directly. Move them from `src/lib/claude/` to `src/lib/llm/`. Keep `schemas.ts` move as part of this task.

**Files:**
- Create: `src/lib/llm/extract-transactions.ts` (refactored from `src/lib/claude/extract-transactions.ts`)
- Create: `src/lib/llm/normalize-merchants.ts` (refactored from `src/lib/claude/normalize-merchants.ts`)
- Create: `src/lib/llm/analyze-finances.ts` (refactored from `src/lib/claude/analyze-finances.ts`)
- Move: `src/lib/claude/schemas.ts` → `src/lib/llm/schemas.ts`
- Delete: `src/lib/claude/models.ts` (replaced by `config.ts` + `factory.ts`)
- Modify tests: `src/__tests__/lib/claude/*.test.ts` → `src/__tests__/lib/llm/*.test.ts`

**Step 1: Move schemas.ts unchanged**

Copy `src/lib/claude/schemas.ts` to `src/lib/llm/schemas.ts` — content unchanged.

**Step 2: Refactor extract-transactions.ts**

Change function signatures:
- `extractRawTransactions(pdfBuffer, model)` → `extractRawTransactions(provider, providerName, pdfBuffer, model)`
- `extractTransactions(pdfBuffer, model)` → `extractTransactions(provider, providerName, pdfBuffer, model)`
- `classifyTransactions(docType, txns, model, knownMappings)` → `classifyTransactions(provider, providerName, docType, txns, model, knownMappings)`
- `reclassifyTransactions(docType, txns, model)` → `reclassifyTransactions(provider, providerName, docType, txns, model)`

Replace:
```typescript
const client = new Anthropic()
const response = await client.messages.create({ model, max_tokens, messages })
const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
```

With:
```typescript
const prompt = getRawExtractionPrompt(providerName)
const response = await provider.extractFromDocument({
  system: prompt.system,
  messages: [{ role: 'user', content: prompt.user }],
  maxTokens: 16384,
  model,
  document: pdfBuffer,
  documentMediaType: 'application/pdf',
})
const text = response.text
```

For text-only calls (classify, reclassify):
```typescript
const prompt = getClassifyPrompt(providerName)
const filledPrompt = prompt.user
  .replace('{document_type}', documentType)
  .replace('{known_mappings}', knownMappingsBlock)
  .replace('{transactions_json}', JSON.stringify(indexed))
const response = await provider.complete({
  system: prompt.system,
  messages: [{ role: 'user', content: filledPrompt }],
  maxTokens: 4096,
  model,
})
const text = response.text
```

Remove `import Anthropic` — no longer needed in this file.

**Step 3: Refactor normalize-merchants.ts**

Change signatures:
- `normalizeBatch(client, batch, model, existingMerchants)` → `normalizeBatch(provider, providerName, batch, model, existingMerchants)`
- `normalizeMerchants(descriptions, model, existingMerchants)` → `normalizeMerchants(provider, providerName, descriptions, model, existingMerchants)`

Replace Anthropic client usage with `provider.complete()` using `getNormalizationPrompt(providerName)`.

**Step 4: Refactor analyze-finances.ts**

Change signatures:
- `analyzeHealthAndPatterns(data, model)` → `analyzeHealthAndPatterns(provider, providerName, data, model)`
- `analyzeDeepInsights(data, health, model)` → `analyzeDeepInsights(provider, providerName, data, health, model)`

Replace Anthropic client usage with `provider.complete()` using `getHealthAndPatternsPrompt(providerName)` and `getDeepInsightsPrompt(providerName)`.

**Step 5: Update tests**

Move test files from `src/__tests__/lib/claude/` to `src/__tests__/lib/llm/`. Replace `MockAnthropic` with a `MockLLMProvider`:

```typescript
import type { LLMProvider } from '@/lib/llm/types'

function createMockProvider(responseText: string): { provider: LLMProvider; mockComplete: ReturnType<typeof vi.fn>; mockExtract: ReturnType<typeof vi.fn> } {
  const mockComplete = vi.fn().mockResolvedValue({ text: responseText })
  const mockExtract = vi.fn().mockResolvedValue({ text: responseText })
  return {
    provider: { complete: mockComplete, extractFromDocument: mockExtract },
    mockComplete,
    mockExtract,
  }
}
```

Tests no longer need `vi.mock('@anthropic-ai/sdk')`. Instead, construct mock provider and pass directly.

**Step 6: Delete old files**

Delete: `src/lib/claude/extract-transactions.ts`, `src/lib/claude/normalize-merchants.ts`, `src/lib/claude/analyze-finances.ts`, `src/lib/claude/schemas.ts`, `src/lib/claude/models.ts`
Delete: `src/__tests__/lib/claude/` directory

**Step 7: Run all tests**

Run: `npm test`
Expected: Some failures from files still importing `@/lib/claude/*` — these are fixed in Task 9.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: refactor LLM functions to use provider abstraction"
```

---

### Task 9: Update Pipeline and All Import Paths

Update `pipeline.ts` and all files that import from `src/lib/claude/` to use the new `src/lib/llm/` paths.

**Files:**
- Modify: `src/lib/pipeline.ts` — use `getProviderForTask()` instead of `getModelForTask()`
- Modify: `src/app/api/upload/route.ts` — update imports if any
- Modify: `src/app/api/reclassify/backfill/route.ts` — update imports
- Modify: `src/app/api/recurring/normalize/route.ts` — update imports
- Modify: `src/app/api/merchant-categories/backfill/route.ts` — update imports if any
- Modify: `src/app/api/merchant-categories/apply/route.ts` — update imports if any
- Modify: any other files importing from `@/lib/claude/`
- Modify: `src/__tests__/lib/pipeline.test.ts` — update mock paths

**Step 1: Search for all imports of `@/lib/claude/`**

Run: `grep -rn "@/lib/claude/" src/`

Fix every occurrence to point to `@/lib/llm/`.

**Step 2: Refactor pipeline.ts**

Replace:
```typescript
import { getModelForTask } from '@/lib/claude/models'
// ...
const extractionModel = getModelForTask(db, 'extraction')
const normalizationModel = getModelForTask(db, 'normalization')
const classificationModel = getModelForTask(db, 'classification')
```

With:
```typescript
import { getProviderForTask } from '@/lib/llm/factory'
// ...
const extraction = getProviderForTask(db, 'extraction')
const normalization = getProviderForTask(db, 'normalization')
const classification = getProviderForTask(db, 'classification')
```

Then pass `extraction.provider, extraction.providerName, ..., extraction.model` to each LLM function call.

**Step 3: Update pipeline test**

Change mock paths:
```typescript
vi.mock('@/lib/llm/extract-transactions', () => ({
  extractRawTransactions: (...args: unknown[]) => mockExtractRaw(...args),
  classifyTransactions: (...args: unknown[]) => mockClassify(...args),
}))

vi.mock('@/lib/llm/normalize-merchants', () => ({
  normalizeMerchants: (...args: unknown[]) => mockNormalize(...args),
}))
```

Update mock call assertions to account for the new `provider, providerName` leading params — mock functions now receive `(provider, providerName, ...originalArgs)`.

**Step 4: Update API routes**

For each API route that calls LLM functions directly (e.g., reclassify backfill), update:
- Import path: `@/lib/claude/extract-transactions` → `@/lib/llm/extract-transactions`
- Add `getProviderForTask()` call and pass provider/model to LLM functions

**Step 5: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 6: Run lint**

Run: `npm run lint`
Expected: No errors (no dangling imports to `@/lib/claude/`)

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: update all imports from claude to llm provider abstraction"
```

---

### Task 10: Update Settings API Route

Expand the `/api/settings` route to handle provider selection per task alongside model selection.

**Files:**
- Modify: `src/app/api/settings/route.ts`
- Test: `src/__tests__/app/api/settings.test.ts` (create)

**Step 1: Write the test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import { getSetting, getAllSettings } from '@/lib/db/settings'

// Mock getDb to return in-memory database
let db: Database.Database
vi.mock('@/lib/db', () => ({
  getDb: () => db,
}))

import { GET, PUT } from '@/app/api/settings/route'

function makeRequest(body: Record<string, string>) {
  return new Request('http://localhost/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/settings', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  describe('GET', () => {
    it('returns available providers based on env vars', async () => {
      const res = await GET()
      const data = await res.json()
      expect(data.availableProviders).toBeDefined()
      expect(Array.isArray(data.availableProviders)).toBe(true)
    })

    it('returns default provider and model settings', async () => {
      const res = await GET()
      const data = await res.json()
      expect(data.provider_extraction).toBe('anthropic')
      expect(data.model_extraction).toBe('claude-sonnet-4-5-20250929')
    })
  })

  describe('PUT', () => {
    it('saves provider setting', async () => {
      const res = await PUT(makeRequest({ provider_extraction: 'openai' }))
      expect(res.status).toBe(200)
      expect(getSetting(db, 'provider_extraction')).toBe('openai')
    })

    it('saves model setting', async () => {
      const res = await PUT(makeRequest({ model_extraction: 'claude-haiku-4-5-20251001' }))
      expect(res.status).toBe(200)
      expect(getSetting(db, 'model_extraction')).toBe('claude-haiku-4-5-20251001')
    })

    it('rejects invalid provider', async () => {
      const res = await PUT(makeRequest({ provider_extraction: 'invalid' }))
      expect(res.status).toBe(400)
    })

    it('rejects invalid key', async () => {
      const res = await PUT(makeRequest({ something_bad: 'value' }))
      const data = await res.json()
      expect(data.updated).toHaveLength(0)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- "src/__tests__/app/api/settings.test.ts"`
Expected: FAIL — GET doesn't return `availableProviders`

**Step 3: Update the route**

**GET handler:**
- Import `PROVIDERS` and `getAvailableProviders` from `@/lib/llm/config`
- Add `availableProviders` field to response
- Fill defaults for both `provider_<task>` and `model_<task>` keys
- Return providers config for UI to build dropdowns: `{ providers: PROVIDERS, availableProviders: [...] }`

**PUT handler:**
- Expand `validKeys` to include `provider_*` keys
- Validate provider values against `isValidProvider()`
- Validate model values: check the model belongs to the provider for that task (read `provider_<task>` from DB or from the same request body)
- Use `isModelValidForProvider()` from config

**Step 4: Run test to verify it passes**

Run: `npm test -- "src/__tests__/app/api/settings.test.ts"`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/app/api/settings/route.ts" "src/__tests__/app/api/settings.test.ts"
git commit -m "feat: expand settings API to support provider selection"
```

---

### Task 11: Update Settings Page UI

Add provider selection dropdowns to the Settings page, with model dropdowns that filter based on the selected provider.

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

**Step 1: Update the Settings page**

Replace the current `AVAILABLE_MODELS` and `MODEL_TASKS` constants with data fetched from `/api/settings` GET response (which now includes `providers` config and `availableProviders` list).

**State changes:**
- Add `providers: Record<string, ProviderConfig>` state (populated from API)
- Add `availableProviders: string[]` state
- Model settings state stays the same but now includes `provider_*` keys

**UI changes per task row:**
1. Provider `<Select>` dropdown — only shows available providers (those with env vars set)
2. Model `<Select>` dropdown — filters models based on selected provider for that task

**`handleProviderChange(task, provider)` handler:**
- Sets `provider_<task>` via PUT
- Also resets `model_<task>` to that provider's default for the task (since old model may not be valid)
- Updates local state immediately for responsive UI

**`handleModelChange(task, model)` handler:**
- Same as current but saves to `model_<task>`

**Step 2: Verify manually**

Run: `npm run dev`
Open: http://localhost:3000/settings
Verify: provider dropdowns appear, model dropdowns filter correctly, changes persist on page reload.

**Step 3: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "feat: add provider selection to settings page"
```

---

### Task 12: Clean Up and Final Verification

**Files:**
- Delete: `src/lib/claude/` directory (should be empty after Task 8)
- Modify: `CLAUDE.md` — update file paths and conventions

**Step 1: Verify no remaining references to old paths**

Run: `grep -rn "lib/claude" src/`
Expected: No results

Run: `grep -rn "lib/claude" src/__tests__/`
Expected: No results

**Step 2: Delete old directory**

```bash
rm -rf src/lib/claude
rm -rf src/__tests__/lib/claude
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 5: Run build**

Run: `npm run build`
Expected: Successful build

**Step 6: Update CLAUDE.md**

Update all references:
- `src/lib/claude/` → `src/lib/llm/`
- `src/lib/claude/models.ts` → `src/lib/llm/config.ts` + `src/lib/llm/factory.ts`
- `src/lib/claude/extract-transactions.ts` → `src/lib/llm/extract-transactions.ts`
- `src/lib/claude/normalize-merchants.ts` → `src/lib/llm/normalize-merchants.ts`
- `src/lib/claude/analyze-finances.ts` → `src/lib/llm/analyze-finances.ts`
- `src/lib/claude/schemas.ts` → `src/lib/llm/schemas.ts`
- Add `src/lib/llm/anthropic/` and `src/lib/llm/openai/` to structure docs
- Add `src/lib/llm/prompts/` to structure docs
- Add `OPENAI_API_KEY` to environment section
- Update mock pattern docs: `MockLLMProvider` instead of `MockAnthropic`
- Add convention: `getProviderForTask(db, task)` returns `{ provider, providerName, model }`

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: clean up old claude directory, update CLAUDE.md for multi-provider"
```
