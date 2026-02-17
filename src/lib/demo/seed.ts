// Demo data orchestrator — insert/clear/check demo mode

import type Database from 'better-sqlite3'
import { DEMO_ACCOUNTS } from './constants'
import { generateDemoTransactions } from './generators'
import { getSetting, setSetting } from '@/lib/db/settings'

export function isDemoMode(db: Database.Database): boolean {
  return getSetting(db, 'demo_mode') === 'true'
}

export function insertDemoData(db: Database.Database): void {
  const transactions = generateDemoTransactions('2025-01', '2025-12')

  db.transaction(() => {
    // Look up category IDs by name
    const catRows = db.prepare('SELECT id, name FROM categories').all() as Array<{ id: number; name: string }>
    const categoryMap = new Map(catRows.map(r => [r.name, r.id]))

    // Insert accounts
    const insertAccount = db.prepare(
      'INSERT INTO accounts (name, institution, last_four, type) VALUES (?, ?, ?, ?)'
    )
    const accountIds: number[] = []
    for (const acct of DEMO_ACCOUNTS) {
      const result = insertAccount.run(acct.name, acct.institution, acct.lastFour, acct.type)
      accountIds.push(Number(result.lastInsertRowid))
    }

    // Group transactions by (accountIndex, month) to create documents
    const docGroups = new Map<string, typeof transactions>()
    for (const txn of transactions) {
      const month = txn.date.slice(0, 7)  // YYYY-MM
      const key = `${txn.accountIndex}-${month}`
      if (!docGroups.has(key)) docGroups.set(key, [])
      docGroups.get(key)!.push(txn)
    }

    const insertDoc = db.prepare(
      `INSERT INTO documents (filename, filepath, status, file_hash, processing_phase, transaction_count)
       VALUES (?, 'demo', 'completed', ?, 'complete', ?)`
    )
    const insertDocAccount = db.prepare(
      'INSERT INTO document_accounts (document_id, account_id, statement_month) VALUES (?, ?, ?)'
    )
    const insertTxn = db.prepare(
      `INSERT INTO transactions (document_id, date, description, amount, type, category_id, normalized_merchant, transaction_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const [key, txns] of docGroups) {
      const [acctIdxStr, month] = key.split('-', 2)
      const acctIdx = Number(acctIdxStr)
      const acctId = accountIds[acctIdx]
      const acctName = DEMO_ACCOUNTS[acctIdx].name.toLowerCase().replace(/\s+/g, '-')

      // Insert document
      const filename = `demo-${acctName}-${month}.pdf`
      const fileHash = `demo-${acctIdx}-${month}`
      const docResult = insertDoc.run(filename, fileHash, txns.length)
      const docId = Number(docResult.lastInsertRowid)

      // Link document to account
      insertDocAccount.run(docId, acctId, month)

      // Insert transactions for this document
      for (const txn of txns) {
        const categoryId = categoryMap.get(txn.category) ?? null
        insertTxn.run(docId, txn.date, txn.description, txn.amount, txn.type, categoryId, txn.normalizedMerchant, txn.transactionClass)
      }
    }

    // Seed merchant_categories
    const insertMerchantCat = db.prepare(
      `INSERT OR IGNORE INTO merchant_categories (normalized_merchant, category_id, source)
       VALUES (?, ?, 'demo')`
    )
    const seenMerchants = new Set<string>()
    for (const txn of transactions) {
      if (seenMerchants.has(txn.normalizedMerchant)) continue
      seenMerchants.add(txn.normalizedMerchant)
      const catId = categoryMap.get(txn.category)
      if (catId) {
        insertMerchantCat.run(txn.normalizedMerchant, catId)
      }
    }

    // Mark Planet Fitness as ended subscription
    db.prepare(
      `INSERT OR IGNORE INTO commitment_status (normalized_merchant, status) VALUES (?, 'ended')`
    ).run('Planet Fitness')

    setSetting(db, 'demo_mode', 'true')
  })()
}

export function clearDemoData(db: Database.Database): void {
  db.transaction(() => {
    db.exec('DELETE FROM excluded_commitment_transactions')
    db.exec('DELETE FROM transactions')
    db.exec('DELETE FROM document_accounts')
    db.exec('DELETE FROM documents')
    db.exec('DELETE FROM accounts')
    db.exec('DELETE FROM insight_cache')
    db.exec('DELETE FROM dismissed_insights')
    db.exec('DELETE FROM commitment_status')
    db.exec('DELETE FROM merchant_categories')
    setSetting(db, 'demo_mode', 'false')
  })()
}
