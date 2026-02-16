import type Database from 'better-sqlite3'

export interface Account {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  created_at: string
}

export interface MonthDocument {
  filename: string
  statementDate: string | null
}

export interface MonthStatus {
  status: 'complete' | 'missing'
  documents: MonthDocument[]
}

export interface AccountWithCompleteness extends Account {
  documentCount: number
  months: Record<string, MonthStatus>
}

interface CreateAccountInput {
  name: string
  institution?: string | null
  lastFour?: string | null
  type: string
}

export function createAccount(db: Database.Database, input: CreateAccountInput): number {
  const result = db.prepare(
    'INSERT INTO accounts (name, institution, last_four, type) VALUES (?, ?, ?, ?)'
  ).run(input.name, input.institution ?? null, input.lastFour ?? null, input.type)
  return result.lastInsertRowid as number
}

export function getAccount(db: Database.Database, id: number): Account | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined
}

export function findAccountByInstitutionAndLastFour(
  db: Database.Database,
  institution: string,
  lastFour: string
): Account | undefined {
  // Exact match first
  const exact = db.prepare(
    'SELECT * FROM accounts WHERE institution = ? AND last_four = ?'
  ).get(institution, lastFour) as Account | undefined
  if (exact) return exact

  // Fuzzy fallback: same last_four, institution contains or is contained by the query
  // Handles LLM inconsistency like "First Tech" vs "First Tech Federal Credit Union"
  return db.prepare(
    'SELECT * FROM accounts WHERE last_four = ? AND (institution LIKE ? OR ? LIKE \'%\' || institution || \'%\') LIMIT 1'
  ).get(lastFour, `%${institution}%`, institution) as Account | undefined
}

export function renameAccount(db: Database.Database, id: number, name: string): void {
  db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name, id)
}

export function mergeAccounts(db: Database.Database, sourceId: number, targetId: number): void {
  const merge = db.transaction(() => {
    // Update junction table — re-point source links to target, skip duplicates
    const sourceLinks = db.prepare(
      'SELECT document_id, statement_month, statement_date FROM document_accounts WHERE account_id = ?'
    ).all(sourceId) as Array<{ document_id: number; statement_month: string | null; statement_date: string | null }>

    for (const link of sourceLinks) {
      db.prepare(
        'INSERT OR IGNORE INTO document_accounts (document_id, account_id, statement_month, statement_date) VALUES (?, ?, ?, ?)'
      ).run(link.document_id, targetId, link.statement_month, link.statement_date)
    }
    db.prepare('DELETE FROM document_accounts WHERE account_id = ?').run(sourceId)

    // Also update legacy documents.account_id for any docs that pointed to source
    db.prepare('UPDATE documents SET account_id = ? WHERE account_id = ?').run(targetId, sourceId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(sourceId)
  })
  merge()
}

export function assignDocumentToAccount(
  db: Database.Database,
  documentId: number,
  accountId: number,
  statementMonth?: string | null,
  statementDate?: string | null
): void {
  // Insert into junction table (supports multi-account docs)
  db.prepare(
    'INSERT OR REPLACE INTO document_accounts (document_id, account_id, statement_month, statement_date) VALUES (?, ?, ?, ?)'
  ).run(documentId, accountId, statementMonth ?? null, statementDate ?? null)

  // Also set documents.account_id for backward compat (first account wins)
  const current = db.prepare('SELECT account_id FROM documents WHERE id = ?').get(documentId) as { account_id: number | null }
  if (!current.account_id) {
    db.prepare('UPDATE documents SET account_id = ? WHERE id = ?').run(accountId, documentId)
  }
}

export function getUnassignedDocuments(db: Database.Database) {
  return db.prepare(`
    SELECT d.id, d.filename, d.filepath, d.document_type, d.uploaded_at, d.status
    FROM documents d
    WHERE NOT EXISTS (SELECT 1 FROM document_accounts da WHERE da.document_id = d.id)
    ORDER BY d.uploaded_at DESC
  `).all() as Array<{ id: number; filename: string; filepath: string; document_type: string | null; uploaded_at: string; status: string }>
}

export function getDocumentsNeedingDetection(db: Database.Database) {
  // Documents that are either unassigned or assigned but missing statement_month
  return db.prepare(`
    SELECT DISTINCT d.id, d.filename, d.filepath, d.document_type, d.uploaded_at, d.status
    FROM documents d
    LEFT JOIN document_accounts da ON da.document_id = d.id
    WHERE d.status = 'completed' AND (da.document_id IS NULL OR da.statement_month IS NULL)
    ORDER BY d.uploaded_at DESC
  `).all() as Array<{ id: number; filename: string; filepath: string; document_type: string | null; uploaded_at: string; status: string }>
}

export function resetAccountDetection(db: Database.Database): void {
  const reset = db.transaction(() => {
    db.prepare('DELETE FROM document_accounts').run()
    db.prepare('UPDATE documents SET account_id = NULL, statement_month = NULL, statement_date = NULL').run()
    db.prepare('DELETE FROM accounts').run()
  })
  reset()
}

export function listAccountsWithCompleteness(db: Database.Database): AccountWithCompleteness[] {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY name').all() as Account[]

  // Get the current month as YYYY-MM
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return accounts.map(account => {
    // Get document count for this account
    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM document_accounts da JOIN documents d ON d.id = da.document_id WHERE da.account_id = ? AND d.status = ?'
    ).get(account.id, 'completed') as { count: number }

    // Get statement months with document filenames and dates
    const monthRows = db.prepare(`
      SELECT da.statement_month as month, d.filename, da.statement_date
      FROM document_accounts da
      JOIN documents d ON d.id = da.document_id
      WHERE da.account_id = ? AND d.status = 'completed' AND da.statement_month IS NOT NULL
      ORDER BY month, d.filename
    `).all(account.id) as Array<{ month: string; filename: string; statement_date: string | null }>

    // Group documents by month
    const monthDocs = new Map<string, MonthDocument[]>()
    for (const row of monthRows) {
      if (!monthDocs.has(row.month)) monthDocs.set(row.month, [])
      monthDocs.get(row.month)!.push({ filename: row.filename, statementDate: row.statement_date })
    }

    // Build months map from earliest covered month to current month
    const months: Record<string, MonthStatus> = {}

    if (monthDocs.size > 0) {
      const sortedMonths = [...monthDocs.keys()].sort()
      const earliest = sortedMonths[0]

      let cursor = earliest
      while (cursor <= currentMonth) {
        const docs = monthDocs.get(cursor)
        months[cursor] = {
          status: docs ? 'complete' : 'missing',
          documents: docs ?? [],
        }
        // Advance to next month
        const [y, m] = cursor.split('-').map(Number)
        const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
        cursor = next
      }
    }

    return {
      ...account,
      documentCount: countRow.count,
      months,
    }
  })
}
