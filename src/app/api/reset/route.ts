import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  let resetSettings = false
  try {
    const body = await request.json()
    resetSettings = body.resetSettings === true
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  const db = getDb()

  db.exec('DELETE FROM excluded_recurring_transactions')
  db.exec('DELETE FROM transactions')
  db.exec('DELETE FROM document_accounts')
  db.exec('DELETE FROM documents')
  db.exec('DELETE FROM accounts')
  db.exec('DELETE FROM insight_cache')
  db.exec('DELETE FROM dismissed_insights')
  db.exec('DELETE FROM dismissed_subscriptions')
  db.exec('DELETE FROM subscription_status')
  db.exec('DELETE FROM merchant_categories')
  db.exec("DELETE FROM settings WHERE key = 'demo_mode'")

  if (resetSettings) {
    db.exec('DELETE FROM settings')
  }

  // Delete uploaded PDF files
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir)
    for (const file of files) {
      fs.unlinkSync(path.join(uploadsDir, file))
    }
  }

  return NextResponse.json({ ok: true })
}
