import type Database from 'better-sqlite3'
import type { InsightCard } from '@/lib/insights/types'
import { createHash } from 'crypto'

export function generateCacheKey(db: Database.Database): string {
  const row = db.prepare(`
    SELECT MAX(date) as last_date, COUNT(*) as count, SUM(amount) as total
    FROM transactions WHERE type = 'debit'
  `).get() as { last_date: string | null; count: number; total: number }

  const raw = `${row.last_date ?? ''}:${row.count}:${Math.round(row.total ?? 0)}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}

export function getCachedInsights(db: Database.Database, key: string): InsightCard[] | null {
  const row = db.prepare(
    `SELECT insight_data FROM insight_cache WHERE cache_key = ? AND expires_at > datetime('now')`
  ).get([key]) as { insight_data: string } | undefined

  if (!row) return null
  return JSON.parse(row.insight_data)
}

export function setCachedInsights(db: Database.Database, key: string, insights: InsightCard[], ttlHours = 24): void {
  // Clean expired entries
  db.prepare(`DELETE FROM insight_cache WHERE expires_at <= datetime('now')`).run()

  db.prepare(`
    INSERT OR REPLACE INTO insight_cache (cache_key, insight_data, created_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' hours'))
  `).run(key, JSON.stringify(insights), ttlHours)
}

export function clearInsightCache(db: Database.Database): void {
  db.prepare('DELETE FROM insight_cache').run()
}

export function dismissInsight(db: Database.Database, insightId: string): void {
  db.prepare('INSERT OR IGNORE INTO dismissed_insights (insight_id) VALUES (?)').run(insightId)
}

export function getDismissedInsightIds(db: Database.Database): string[] {
  const rows = db.prepare('SELECT insight_id FROM dismissed_insights').all() as Array<{ insight_id: string }>
  return rows.map(r => r.insight_id)
}

export function clearDismissedInsights(db: Database.Database): void {
  db.prepare('DELETE FROM dismissed_insights').run()
}
