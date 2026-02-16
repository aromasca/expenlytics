import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { createAccount, findAccountByInstitutionAndLastFour, assignDocumentToAccount } from '@/lib/db/accounts'
import { getProviderForTask } from '@/lib/llm/factory'
import { PDFParse } from 'pdf-parse'
import { readFile } from 'fs/promises'
import { z } from 'zod'

const accountSchema = z.object({
  account_name: z.string().optional(),
  institution: z.string().optional(),
  last_four: z.string().optional(),
  document_type: z.string().optional(),
  statement_month: z.string().optional(),
  statement_date: z.string().optional(),
})

const detectionSchema = z.union([
  z.array(accountSchema),
  accountSchema.transform(v => [v]),
])

function extractJSON(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) return jsonMatch[1]
  const openFence = text.match(/```(?:json)?\s*([\s\S]*)/)
  if (openFence) return openFence[1]
  return text
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { documentId } = body

  if (!Number.isInteger(documentId)) {
    return NextResponse.json({ error: 'documentId must be an integer' }, { status: 400 })
  }

  const db = getDb()
  const doc = db.prepare('SELECT id, filename, filepath, document_type FROM documents WHERE id = ?').get(documentId) as
    { id: number; filename: string; filepath: string; document_type: string | null } | undefined

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Extract text from PDF (local, no LLM)
  let excerpt: string
  try {
    const pdfBuffer = await readFile(doc.filepath)
    const pdf = new PDFParse({ data: pdfBuffer })
    const parsed = await pdf.getText()
    await pdf.destroy()

    if (!parsed.text || parsed.text.trim().length === 0) {
      return NextResponse.json({ error: 'Could not extract text from PDF', skipped: true })
    }
    // Send first 2000 chars to capture multi-account sections + date keyword lines from deeper in the doc
    const top = parsed.text.slice(0, 2000)
    const dateLines = parsed.text.slice(2000).split('\n')
      .filter(l => /opening|closing|statement\s*date|billing\s*period|period\s*ending|statement\s*period/i.test(l))
      .map(l => l.trim())
      .filter(Boolean)
      .slice(0, 5)
    excerpt = dateLines.length > 0
      ? top + '\n\n--- Key date lines found elsewhere in document ---\n' + dateLines.join('\n')
      : top
  } catch {
    return NextResponse.json({ error: 'Could not read PDF', skipped: true })
  }

  // Single LLM call
  const { provider, model } = getProviderForTask(db, 'extraction')

  const prompt = `You are analyzing a financial statement to identify all bank accounts and billing periods in it.

Some statements contain MULTIPLE accounts (e.g., a combined checking + savings statement). Extract ALL accounts found.

For each account, extract:
- account_name: the account or card name (e.g., "Sapphire Reserve", "Rewards Checking", "Membership Savings")
- institution: the bank or financial institution (e.g., "Chase", "First Tech")
- last_four: the last 4 digits of the account number
- document_type: "credit_card", "checking_account", "savings_account", "investment", or "other"
- statement_month: the billing period month in YYYY-MM format (e.g., "2025-01"). Use the statement closing date or "statement period ending" date.
- statement_date: the exact statement period or closing date as printed on the document. Copy verbatim.

Return ONLY valid JSON. If multiple accounts, return an array:
[{"account_name": "...", "institution": "...", "last_four": "...", "document_type": "...", "statement_month": "YYYY-MM", "statement_date": "..."}, ...]

If only one account, you may return a single object instead of an array.
Omit fields not visible in the text.

Statement text:
${excerpt}`

  try {
    const response = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      model,
    })

    const jsonStr = extractJSON(response.text)
    const parsed = JSON.parse(jsonStr.trim())
    const results = detectionSchema.parse(parsed)

    const accountNames: string[] = []

    for (const result of results) {
      const institution = result.institution
      if (!institution) continue

      const lastFour = result.last_four
      const docType = result.document_type ?? doc.document_type ?? 'other'
      let accountId: number
      let accountName: string

      if (lastFour) {
        const existing = findAccountByInstitutionAndLastFour(db, institution, lastFour)
        if (existing) {
          accountId = existing.id
          accountName = existing.name
        } else {
          accountName = result.account_name || `${institution} ·${lastFour}`
          accountId = createAccount(db, { name: accountName, institution, lastFour, type: docType })
        }
      } else {
        const existing = db.prepare(
          'SELECT id, name FROM accounts WHERE institution = ? AND type = ? LIMIT 1'
        ).get(institution, docType) as { id: number; name: string } | undefined
        if (existing) {
          accountId = existing.id
          accountName = existing.name
        } else {
          accountName = result.account_name || institution
          accountId = createAccount(db, { name: accountName, institution, lastFour: null, type: docType })
        }
      }

      assignDocumentToAccount(db, documentId, accountId, result.statement_month, result.statement_date)
      accountNames.push(accountName)
      console.log(`[account-detect] Document ${documentId} → "${accountName}" (${result.statement_month ?? 'no month'})`)
    }

    if (accountNames.length === 0) {
      return NextResponse.json({ detected: false, reason: 'No institution found' })
    }

    // Store first account's statement info on the document for backward compat
    const first = results.find(r => r.statement_month)
    if (first) {
      db.prepare('UPDATE documents SET statement_month = ?, statement_date = ? WHERE id = ?')
        .run(first.statement_month ?? null, first.statement_date ?? null, documentId)
    }

    return NextResponse.json({
      detected: true,
      accountName: accountNames.join(', '),
      accountCount: accountNames.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[account-detect] Document ${documentId} failed: ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
