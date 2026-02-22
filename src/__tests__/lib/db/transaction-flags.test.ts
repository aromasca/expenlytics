import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeSchema } from '@/lib/db/schema'
import {
  createFlag,
  resolveFlag,
  getFlagsForTransaction,
  getUnresolvedFlags,
  getUnresolvedFlagCount,
  clearFlagsForDocument,
} from '@/lib/db/transaction-flags'

function seedData(db: Database.Database) {
  const catId = db.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }
  const doc1Id = Number(
    db.prepare("INSERT INTO documents (filename, filepath, status) VALUES ('doc1.pdf', '/tmp/doc1.pdf', 'completed')").run().lastInsertRowid
  )
  const doc2Id = Number(
    db.prepare("INSERT INTO documents (filename, filepath, status) VALUES ('doc2.pdf', '/tmp/doc2.pdf', 'completed')").run().lastInsertRowid
  )

  const txn1Id = Number(
    db.prepare(
      "INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run('2025-01-15', 'ACME STORE #123', 50.00, 'debit', catId.id, doc1Id, 'Acme Store').lastInsertRowid
  )
  const txn2Id = Number(
    db.prepare(
      "INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run('2025-01-16', 'ACME STORE #456', 50.00, 'debit', catId.id, doc1Id, 'Acme Store').lastInsertRowid
  )
  const txn3Id = Number(
    db.prepare(
      "INSERT INTO transactions (date, description, amount, type, category_id, document_id, normalized_merchant) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run('2025-02-01', 'ACME CORP BILLING', 100.00, 'debit', catId.id, doc2Id, 'Acme Corp').lastInsertRowid
  )

  return { doc1Id, doc2Id, txn1Id, txn2Id, txn3Id, catId: catId.id }
}

describe('transaction_flags schema', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('creates the transaction_flags table', () => {
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transaction_flags'"
    ).get() as { name: string } | undefined
    expect(table).toBeDefined()
    expect(table!.name).toBe('transaction_flags')
  })

  it('creates indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='transaction_flags'"
    ).all() as Array<{ name: string }>
    const names = indexes.map(i => i.name)
    expect(names).toContain('idx_transaction_flags_txn')
    expect(names).toContain('idx_transaction_flags_unresolved')
  })

  it('enforces UNIQUE constraint on (transaction_id, flag_type)', () => {
    const { txn1Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')

    // Direct insert should fail
    expect(() => {
      db.prepare(
        "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, ?)"
      ).run(txn1Id, 'duplicate')
    }).toThrow()
  })

  it('allows different flag types for same transaction', () => {
    const { txn1Id } = seedData(db)
    const id1 = createFlag(db, txn1Id, 'duplicate')
    const id2 = createFlag(db, txn1Id, 'category_mismatch')
    expect(id1).not.toBe(id2)

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags).toHaveLength(2)
  })

  it('cascades delete when transaction is deleted', () => {
    const { txn1Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')
    expect(getUnresolvedFlagCount(db)).toBe(1)

    db.prepare('DELETE FROM transactions WHERE id = ?').run(txn1Id)
    expect(getUnresolvedFlagCount(db)).toBe(0)
  })

  it('rejects invalid flag_type via CHECK constraint', () => {
    const { txn1Id } = seedData(db)
    expect(() => {
      db.prepare(
        "INSERT INTO transaction_flags (transaction_id, flag_type) VALUES (?, ?)"
      ).run(txn1Id, 'invalid_type')
    }).toThrow()
  })
})

describe('createFlag', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('inserts a flag and returns its id', () => {
    const { txn1Id } = seedData(db)
    const id = createFlag(db, txn1Id, 'duplicate')
    expect(id).toBeGreaterThan(0)

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags).toHaveLength(1)
    expect(flags[0].flag_type).toBe('duplicate')
  })

  it('stores details as JSON', () => {
    const { txn1Id, txn2Id } = seedData(db)
    const details = { matched_transaction_id: txn2Id, confidence: 0.95 }
    createFlag(db, txn1Id, 'duplicate', details)

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags[0].details).toEqual(details)
  })

  it('stores null details when not provided', () => {
    const { txn1Id } = seedData(db)
    createFlag(db, txn1Id, 'suspicious')

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags[0].details).toBeNull()
  })

  it('is idempotent — returns existing id for same txn+type', () => {
    const { txn1Id } = seedData(db)
    const id1 = createFlag(db, txn1Id, 'duplicate')
    const id2 = createFlag(db, txn1Id, 'duplicate')
    expect(id1).toBe(id2)

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags).toHaveLength(1)
  })
})

describe('resolveFlag', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('sets resolution and resolved_at', () => {
    const { txn1Id } = seedData(db)
    const id = createFlag(db, txn1Id, 'duplicate')

    resolveFlag(db, id, 'dismissed')

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags[0].resolution).toBe('dismissed')
    expect(flags[0].resolved_at).not.toBeNull()
  })

  it('resolved flags are excluded from unresolved count', () => {
    const { txn1Id, txn2Id } = seedData(db)
    const id1 = createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'suspicious')

    expect(getUnresolvedFlagCount(db)).toBe(2)

    resolveFlag(db, id1, 'removed')
    expect(getUnresolvedFlagCount(db)).toBe(1)
  })
})

describe('getUnresolvedFlags', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('returns unresolved flags with transaction data', () => {
    const { txn1Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate', { reason: 'same amount and date' })

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
    expect(flags[0].transaction_id).toBe(txn1Id)
    expect(flags[0].description).toBe('ACME STORE #123')
    expect(flags[0].amount).toBe(50.00)
    expect(flags[0].category_name).toBe('Groceries')
    expect(flags[0].normalized_merchant).toBe('Acme Store')
    expect(flags[0].details).toEqual({ reason: 'same amount and date' })
  })

  it('excludes resolved flags', () => {
    const { txn1Id, txn2Id } = seedData(db)
    const id1 = createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'suspicious')

    resolveFlag(db, id1, 'kept')

    const flags = getUnresolvedFlags(db)
    expect(flags).toHaveLength(1)
    expect(flags[0].transaction_id).toBe(txn2Id)
  })

  it('filters by flag type', () => {
    const { txn1Id, txn2Id, txn3Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'duplicate')
    createFlag(db, txn3Id, 'category_mismatch')

    const duplicates = getUnresolvedFlags(db, 'duplicate')
    expect(duplicates).toHaveLength(2)
    expect(duplicates.every(f => f.flag_type === 'duplicate')).toBe(true)

    const mismatches = getUnresolvedFlags(db, 'category_mismatch')
    expect(mismatches).toHaveLength(1)
  })

  it('returns empty array when no unresolved flags', () => {
    expect(getUnresolvedFlags(db)).toHaveLength(0)
  })

  it('orders by date descending', () => {
    const { txn1Id, txn2Id, txn3Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'duplicate')
    createFlag(db, txn3Id, 'duplicate')

    const flags = getUnresolvedFlags(db)
    expect(flags[0].date).toBe('2025-02-01')
    expect(flags[1].date).toBe('2025-01-16')
    expect(flags[2].date).toBe('2025-01-15')
  })
})

describe('getUnresolvedFlagCount', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('returns 0 when no flags exist', () => {
    expect(getUnresolvedFlagCount(db)).toBe(0)
  })

  it('returns correct count', () => {
    const { txn1Id, txn2Id, txn3Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'suspicious')
    createFlag(db, txn3Id, 'category_mismatch')

    expect(getUnresolvedFlagCount(db)).toBe(3)

    resolveFlag(db, 1, 'dismissed')
    expect(getUnresolvedFlagCount(db)).toBe(2)
  })
})

describe('clearFlagsForDocument', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('removes flags for all transactions in a document', () => {
    const { doc1Id, txn1Id, txn2Id, txn3Id } = seedData(db)
    createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn2Id, 'duplicate')
    createFlag(db, txn3Id, 'suspicious')

    expect(getUnresolvedFlagCount(db)).toBe(3)

    clearFlagsForDocument(db, doc1Id)

    // txn1 and txn2 belong to doc1, txn3 belongs to doc2
    expect(getUnresolvedFlagCount(db)).toBe(1)
    const remaining = getUnresolvedFlags(db)
    expect(remaining[0].transaction_id).toBe(txn3Id)
  })

  it('does nothing when document has no flagged transactions', () => {
    const { doc1Id, txn3Id } = seedData(db)
    createFlag(db, txn3Id, 'suspicious') // txn3 is in doc2

    clearFlagsForDocument(db, doc1Id)
    expect(getUnresolvedFlagCount(db)).toBe(1)
  })
})

describe('getFlagsForTransaction', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeSchema(db)
  })

  it('returns all flags for a transaction including resolved ones', () => {
    const { txn1Id } = seedData(db)
    const id1 = createFlag(db, txn1Id, 'duplicate')
    createFlag(db, txn1Id, 'category_mismatch')

    resolveFlag(db, id1, 'removed')

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags).toHaveLength(2)
    expect(flags.find(f => f.flag_type === 'duplicate')!.resolution).toBe('removed')
    expect(flags.find(f => f.flag_type === 'category_mismatch')!.resolution).toBeNull()
  })

  it('parses JSON details correctly', () => {
    const { txn1Id } = seedData(db)
    const details = { matched_id: 42, scores: [0.9, 0.8] }
    createFlag(db, txn1Id, 'duplicate', details)

    const flags = getFlagsForTransaction(db, txn1Id)
    expect(flags[0].details).toEqual(details)
  })

  it('returns empty array for transaction with no flags', () => {
    const { txn1Id } = seedData(db)
    expect(getFlagsForTransaction(db, txn1Id)).toHaveLength(0)
  })
})
