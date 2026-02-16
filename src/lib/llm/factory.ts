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
  merge_suggestions: { provider: 'provider_merge_suggestions', model: 'model_merge_suggestions' },
}

const DEFAULT_PROVIDER: ProviderName = 'anthropic'

const providerCache = new Map<ProviderName, LLMProvider>()

function getOrCreateProvider(name: ProviderName): LLMProvider {
  const cached = providerCache.get(name)
  if (cached) return cached

  let provider: LLMProvider
  switch (name) {
    case 'anthropic': provider = new AnthropicProvider(); break
    case 'openai': provider = new OpenAIProvider(); break
    default: throw new Error(`Unknown provider: ${name}`)
  }
  providerCache.set(name, provider)
  return provider
}

export interface ProviderForTask {
  provider: LLMProvider
  providerName: ProviderName
  model: string
}

export function getProviderForTask(db: Database.Database, task: TaskName): ProviderForTask {
  const keys = TASK_SETTINGS_KEYS[task]

  const savedProvider = getSetting(db, keys.provider)
  const providerName: ProviderName =
    savedProvider && isValidProvider(savedProvider) ? savedProvider : DEFAULT_PROVIDER
  const providerConfig = PROVIDERS[providerName]

  const savedModel = getSetting(db, keys.model)
  const model =
    savedModel && isModelValidForProvider(providerName, savedModel)
      ? savedModel
      : providerConfig.defaults[task]

  return {
    provider: getOrCreateProvider(providerName),
    providerName,
    model,
  }
}
