import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { resetAccountDetection } from '@/lib/db/accounts'

export async function POST() {
  const db = getDb()
  resetAccountDetection(db)
  return NextResponse.json({ success: true })
}
