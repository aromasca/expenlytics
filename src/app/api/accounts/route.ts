import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listAccountsWithCompleteness, getUnassignedDocuments, getDocumentsNeedingDetection } from '@/lib/db/accounts'

export async function GET() {
  const db = getDb()
  const accounts = listAccountsWithCompleteness(db)
  const unassigned = getUnassignedDocuments(db)
  const needsDetection = getDocumentsNeedingDetection(db)
  return NextResponse.json({ accounts, unassigned, needsDetection })
}
