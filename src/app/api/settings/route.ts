import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllSettings, setSetting } from '@/lib/db/settings'
import { MODEL_TASKS, AVAILABLE_MODELS, isValidModel } from '@/lib/claude/models'

export async function GET() {
  const db = getDb()
  const settings = getAllSettings(db)

  // Fill in defaults for unset model keys
  for (const task of Object.values(MODEL_TASKS)) {
    if (!settings[task.key]) {
      settings[task.key] = task.default
    }
  }

  return NextResponse.json(settings)
}

export async function PUT(request: NextRequest) {
  const db = getDb()
  const body = await request.json()

  const validKeys = new Set<string>(Object.values(MODEL_TASKS).map(t => t.key))
  const validModelIds = new Set(AVAILABLE_MODELS.map(m => m.id))
  const updated: string[] = []

  for (const [key, value] of Object.entries(body)) {
    if (!validKeys.has(key)) {
      return NextResponse.json({ error: `Invalid setting key: ${key}` }, { status: 400 })
    }
    if (typeof value !== 'string' || !isValidModel(value)) {
      return NextResponse.json({ error: `Invalid model for ${key}: ${value}. Valid: ${[...validModelIds].join(', ')}` }, { status: 400 })
    }
    setSetting(db, key, value)
    updated.push(key)
  }

  return NextResponse.json({ updated })
}
