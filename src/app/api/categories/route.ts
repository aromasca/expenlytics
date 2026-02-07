import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAllCategories } from '@/lib/db/categories'

export async function GET() {
  const db = getDb()
  const categories = getAllCategories(db)
  return NextResponse.json(categories)
}
