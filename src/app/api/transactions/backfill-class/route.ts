import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST() {
  const db = getDb()

  // Infer transaction_class from existing category + type for rows that don't have it
  const nullCount = (db.prepare(
    'SELECT COUNT(*) as count FROM transactions WHERE transaction_class IS NULL'
  ).get() as { count: number }).count

  if (nullCount === 0) {
    return NextResponse.json({ updated: 0, total: 0, message: 'All transactions already classified' })
  }

  // Transfer/Savings/Investments categories → 'transfer'
  db.prepare(`
    UPDATE transactions SET transaction_class = 'transfer'
    WHERE transaction_class IS NULL
      AND category_id IN (SELECT id FROM categories WHERE name IN ('Transfer', 'Savings', 'Investments'))
  `).run()

  // Refund category → 'refund'
  db.prepare(`
    UPDATE transactions SET transaction_class = 'refund'
    WHERE transaction_class IS NULL
      AND category_id IN (SELECT id FROM categories WHERE name = 'Refund')
  `).run()

  // Fees & Charges → 'fee'
  db.prepare(`
    UPDATE transactions SET transaction_class = 'fee'
    WHERE transaction_class IS NULL
      AND category_id IN (SELECT id FROM categories WHERE name = 'Fees & Charges')
  `).run()

  // Interest & Finance Charges → 'interest'
  db.prepare(`
    UPDATE transactions SET transaction_class = 'interest'
    WHERE transaction_class IS NULL
      AND category_id IN (SELECT id FROM categories WHERE name = 'Interest & Finance Charges')
  `).run()

  // Credit-type + Transfer category → 'payment' (e.g., CC payments received)
  db.prepare(`
    UPDATE transactions SET transaction_class = 'payment'
    WHERE transaction_class IS NULL
      AND type = 'credit'
      AND category_id IN (SELECT id FROM categories WHERE name = 'Transfer')
  `).run()

  // All remaining NULL → 'purchase'
  db.prepare(`
    UPDATE transactions SET transaction_class = 'purchase'
    WHERE transaction_class IS NULL
  `).run()

  const updated = nullCount - (db.prepare(
    'SELECT COUNT(*) as count FROM transactions WHERE transaction_class IS NULL'
  ).get() as { count: number }).count

  return NextResponse.json({ updated, total: nullCount })
}
