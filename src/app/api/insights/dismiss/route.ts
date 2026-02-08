import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { dismissInsight, clearDismissedInsights } from '@/lib/db/insight-cache'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const insightId = body.insightId
    if (typeof insightId !== 'string' || !insightId) {
      return NextResponse.json({ error: 'insightId is required' }, { status: 400 })
    }
    const db = getDb()
    dismissInsight(db, insightId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to dismiss insight:', error)
    return NextResponse.json({ error: 'Failed to dismiss insight' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const db = getDb()
    clearDismissedInsights(db)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear dismissals:', error)
    return NextResponse.json({ error: 'Failed to clear dismissals' }, { status: 500 })
  }
}
