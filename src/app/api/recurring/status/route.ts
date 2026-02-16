import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { setSubscriptionStatus } from '@/lib/db/recurring'

const VALID_STATUSES = new Set(['active', 'ended', 'not_recurring'])

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { merchant, status, notes, statusDate } = body ?? {}

  if (typeof merchant !== 'string' || !merchant.trim()) {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'status must be active, ended, or not_recurring' }, { status: 400 })
  }

  const db = getDb()
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const validDate = typeof statusDate === 'string' && DATE_RE.test(statusDate) ? statusDate : undefined
  setSubscriptionStatus(db, merchant.trim(), status, typeof notes === 'string' ? notes : undefined, validDate)
  return NextResponse.json({ success: true })
}
