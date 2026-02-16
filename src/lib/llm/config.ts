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
      insights: 'claude-sonnet-4-5-20250929',
    },
  },
  openai: {
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-5.2', name: 'GPT-5.2' },
    ],
    defaults: {
      extraction: 'gpt-4o',
      classification: 'gpt-5-mini',
      normalization: 'gpt-5-mini',
      insights: 'gpt-5',
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
