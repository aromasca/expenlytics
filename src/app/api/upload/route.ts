import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { getDb } from '@/lib/db'
import { createDocument, updateDocumentStatus } from '@/lib/db/documents'
import { getAllCategories } from '@/lib/db/categories'
import { extractTransactions } from '@/lib/claude/extract-transactions'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  }

  const db = getDb()

  // Save file to disk
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads')
  await mkdir(uploadsDir, { recursive: true })
  const filename = `${Date.now()}-${file.name}`
  const filepath = path.join(uploadsDir, filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filepath, buffer)

  // Create document record
  const docId = createDocument(db, file.name, filepath)
  updateDocumentStatus(db, docId, 'processing')

  try {
    // Extract transactions + categories via Claude (single LLM call)
    const result = await extractTransactions(buffer)

    // Map LLM-returned category names to DB category IDs
    const categories = getAllCategories(db)
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))
    const otherCategoryId = categoryMap.get('other')!

    // Insert transactions with LLM-assigned categories
    const insert = db.prepare(
      'INSERT INTO transactions (document_id, date, description, amount, type, category_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const insertMany = db.transaction(() => {
      for (const t of result.transactions) {
        const categoryId = categoryMap.get(t.category.toLowerCase()) ?? otherCategoryId
        insert.run(docId, t.date, t.description, t.amount, t.type, categoryId)
      }
    })
    insertMany()

    updateDocumentStatus(db, docId, 'completed')

    return NextResponse.json({
      document_id: docId,
      transactions_count: result.transactions.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    updateDocumentStatus(db, docId, 'failed', message)
    return NextResponse.json({ error: `Extraction failed: ${message}` }, { status: 500 })
  }
}
