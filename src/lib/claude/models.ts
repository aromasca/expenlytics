import type Database from 'better-sqlite3'
import { getSetting } from '@/lib/db/settings'

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
] as const

export type ModelId = (typeof AVAILABLE_MODELS)[number]['id']

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map(m => m.id))

export function isValidModel(id: string): id is ModelId {
  return VALID_MODEL_IDS.has(id)
}

export const MODEL_TASKS = {
  extraction: {
    key: 'model_extraction',
    label: 'PDF Extraction',
    description: 'Extracts raw transactions from PDF documents',
    default: 'claude-sonnet-4-5-20250929' as ModelId,
  },
  classification: {
    key: 'model_classification',
    label: 'Transaction Classification',
    description: 'Assigns categories to transactions',
    default: 'claude-sonnet-4-5-20250929' as ModelId,
  },
  normalization: {
    key: 'model_normalization',
    label: 'Merchant Normalization',
    description: 'Normalizes merchant names for recurring detection',
    default: 'claude-haiku-4-5-20251001' as ModelId,
  },
  insights: {
    key: 'model_insights',
    label: 'Financial Insights',
    description: 'Generates health scores and spending insights',
    default: 'claude-haiku-4-5-20251001' as ModelId,
  },
} as const

export type ModelTask = keyof typeof MODEL_TASKS

export function getModelForTask(db: Database.Database, task: ModelTask): string {
  const config = MODEL_TASKS[task]
  const saved = getSetting(db, config.key)
  if (saved && isValidModel(saved)) return saved
  return config.default
}
