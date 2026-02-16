import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllSettings, getSetting, setSetting } from '@/lib/db/settings'
import { PROVIDERS, getAvailableProviders, isValidProvider, isModelValidForProvider } from '@/lib/llm/config'
import type { ProviderName, TaskName } from '@/lib/llm/types'

const TASK_NAMES: TaskName[] = ['extraction', 'classification', 'normalization', 'insights']

const VALID_KEYS = new Set<string>([
  ...TASK_NAMES.map(t => `provider_${t}`),
  ...TASK_NAMES.map(t => `model_${t}`),
])

export async function GET() {
  const db = getDb()
  const settings = getAllSettings(db)

  // Fill defaults for any missing settings
  for (const task of TASK_NAMES) {
    if (!settings[`provider_${task}`]) {
      settings[`provider_${task}`] = 'anthropic'
    }
    const providerName = settings[`provider_${task}`] as ProviderName
    const providerConfig = PROVIDERS[providerName]
    if (!settings[`model_${task}`]) {
      settings[`model_${task}`] = providerConfig.defaults[task]
    }
  }

  return NextResponse.json({
    ...settings,
    availableProviders: getAvailableProviders(),
    providers: PROVIDERS,
  })
}

export async function PUT(request: NextRequest) {
  const db = getDb()
  const body = await request.json()
  const updated: string[] = []

  for (const [key, value] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) continue

    if (key.startsWith('provider_')) {
      if (!isValidProvider(value as string)) {
        return NextResponse.json({ error: `Invalid provider: ${value}` }, { status: 400 })
      }
    }

    if (key.startsWith('model_')) {
      const task = key.replace('model_', '') as TaskName
      // Get the provider for this task from the request body, DB, or default
      const providerKey = `provider_${task}`
      const providerName = (body[providerKey] || getSetting(db, providerKey) || 'anthropic') as ProviderName
      if (!isModelValidForProvider(providerName, value as string)) {
        return NextResponse.json(
          { error: `Model ${value} is not valid for provider ${providerName}` },
          { status: 400 }
        )
      }
    }

    setSetting(db, key, value as string)
    updated.push(key)
  }

  return NextResponse.json({ updated })
}
