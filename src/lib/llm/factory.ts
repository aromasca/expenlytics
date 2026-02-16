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
    provider: createProvider(providerName),
    providerName,
    model,
  }
}
