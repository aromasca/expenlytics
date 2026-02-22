import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectDuplicates, detectCategoryMismatches } from '@/lib/detect-duplicates'

export async function POST() {
  const db = getDb()
  const duplicates = detectDuplicates(db)
  const mismatches = detectCategoryMismatches(db)
  return NextResponse.json({ duplicates, mismatches, total: duplicates + mismatches })
}
