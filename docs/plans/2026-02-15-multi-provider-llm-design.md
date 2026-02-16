# Multi-Provider LLM Support

## Overview

Replace the hardcoded Anthropic SDK integration with a provider adapter pattern that supports multiple LLM providers per pipeline task. Day-1 providers: Anthropic + OpenAI, with the abstraction designed for future providers (Gemini, local models).

## Key Decisions

- **API keys**: env vars only (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) — no key storage in DB
- **Granularity**: per-task provider + model selection (extraction, classification, normalization, insights can each use a different provider/model)
- **Prompts**: provider-specific variants — each provider gets optimized prompts rather than a one-size-fits-all format
- **Day-1 scope**: Anthropic + OpenAI fully working; abstraction ready for Gemini and local models

## Provider Interface

```typescript
interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>
  extractFromDocument(request: LLMDocumentRequest): Promise<LLMResponse>
}

interface LLMRequest {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
  model: string
}

interface LLMDocumentRequest extends LLMRequest {
  document: Buffer
  documentMediaType: string
}

interface LLMResponse {
  text: string
}
```

- `extractFromDocument` is separate because providers handle PDFs differently (Anthropic: native document blocks, OpenAI: file upload API)
- Response is just text — JSON parsing and Zod validation stay in caller functions
- No streaming — all current calls are batch

## Provider Implementations

### Anthropic

Thin wrapper around `@anthropic-ai/sdk`:
- `complete()` → `client.messages.create()` with system message and user/assistant messages
- `extractFromDocument()` → `client.messages.create()` with `type: 'document'` content block (base64 encoded PDF) — exactly as today

### OpenAI

Uses `openai` npm package with two API surfaces:
- `complete()` → `client.chat.completions.create()` — the universal chat completions format, compatible with Gemini and local model servers (Ollama, LM Studio, vLLM). This means a future "local models" provider can reuse the OpenAI provider with a different base URL.
- `extractFromDocument()` → `client.files.create({ purpose: "user_data" })` to upload the PDF, then `client.responses.create()` with `input_file` reference + extraction prompt. Uses OpenAI's native file input support.

### Provider instantiation

Each provider is constructed with no args. API keys come from env vars. The factory checks if the required env var exists and throws a clear error if missing.

## Directory Structure

```
src/lib/llm/
  types.ts              — LLMProvider interface, LLMRequest, LLMResponse, shared types
  factory.ts            — getProviderForTask(db, task) → { provider, model, providerName }
  config.ts             — PROVIDERS config (replaces models.ts)
  anthropic/
    provider.ts         — AnthropicProvider implements LLMProvider
  openai/
    provider.ts         — OpenAIProvider implements LLMProvider
  prompts/
    extraction.ts       — getExtractionPrompt(provider) → { system?, user }
    classification.ts   — getClassificationPrompt(provider) → { system?, user }
    normalization.ts    — getNormalizationPrompt(provider) → { system?, user }
    insights.ts         — getHealthPrompt(provider), getDeepInsightsPrompt(provider)
  extract-transactions.ts   — refactored from src/lib/claude/extract-transactions.ts
  normalize-merchants.ts    — refactored from src/lib/claude/normalize-merchants.ts
  analyze-finances.ts       — refactored from src/lib/claude/analyze-finances.ts
  schemas.ts                — moved from src/lib/claude/schemas.ts (unchanged)
```

`src/lib/claude/` is removed entirely. All imports update to `@/lib/llm/`.

## Prompts

Prompt strings move from inline in the LLM function files into `src/lib/llm/prompts/`. Each prompt file exports a function that takes a provider name and returns `{ system?: string, user: string }`.

- **Anthropic prompts**: keep XML-style tags, structured rules, explicit disambiguation sections
- **OpenAI prompts**: markdown headers, direct instruction style, adapted for GPT behavior patterns

Provider-agnostic content (category lists, transfer identification rules, Zod schemas, JSON parsing) stays in `schemas.ts` and the caller functions.

## Configuration & Settings

### Provider config

```typescript
const PROVIDERS = {
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
    }
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
    }
  }
}
```

### Settings table

Two settings per task (8 total):
- `provider_extraction`, `provider_classification`, `provider_normalization`, `provider_insights` → provider ID string
- `model_extraction`, `model_classification`, `model_normalization`, `model_insights` → model ID string

### Factory function

`getProviderForTask(db, task)` reads both settings, falls back to defaults (`"anthropic"` provider, task-specific default model), validates the model belongs to the provider, and returns `{ provider: LLMProvider, model: string, providerName: string }`.

### Migration

Existing `model_<task>` settings continue to work. Missing `provider_<task>` defaults to `"anthropic"`. Zero migration needed for existing users.

## Settings Page Changes

Each task row gets:
1. **Provider dropdown** — only shows providers whose env var is set (determined by `/api/settings` GET response)
2. **Model dropdown** — filters to models for the selected provider

The `/api/settings` GET endpoint adds an `availableProviders` field listing which providers have their env vars configured. The PUT endpoint validates that the chosen model belongs to the chosen provider.

## Caller Function Refactoring

Current pattern:
```typescript
const client = new Anthropic()
const response = await client.messages.create({ model, max_tokens, messages, system })
const text = response.content[0].type === 'text' ? response.content[0].text : ''
```

New pattern:
```typescript
const prompt = getExtractionPrompt(providerName)
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

Functions accept `provider: LLMProvider` + `providerName: string` + `model: string` instead of just `model?: string`. JSON parsing and Zod validation unchanged.

### Pipeline integration

`processDocument()` calls `getProviderForTask()` for each task and passes the provider + model through to each step. Same orchestration flow, just different plumbing.

## Error Handling

- Factory throws clear error if required env var is missing
- Settings UI only shows providers whose env vars are set
- Existing try/catch around optional LLM calls (normalization) unchanged
- Provider adapters surface SDK errors as-is (no wrapping)

## Testing

- `MockLLMProvider` implements `LLMProvider` with `vi.fn()` for both methods — replaces `MockAnthropic` class pattern
- Provider-specific tests verify correct API translation per adapter
- Prompt tests verify each provider variant returns valid structures
- Existing integration tests swap in `MockLLMProvider`
- Factory tests verify env var checking, settings lookup, defaults

## What Does NOT Change

- Zod schemas (schemas.ts — just moves directory)
- JSON parsing logic
- Merchant memory system
- Pipeline orchestration flow
- Any UI except Settings page model selectors
- Database schema (settings table already exists)
