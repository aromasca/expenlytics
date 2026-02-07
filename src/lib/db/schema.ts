import type Database from 'better-sqlite3'

const SEED_CATEGORIES = [
  { name: 'Groceries', color: '#22C55E' },
  { name: 'Dining', color: '#F97316' },
  { name: 'Transport', color: '#3B82F6' },
  { name: 'Housing', color: '#8B5CF6' },
  { name: 'Utilities', color: '#EAB308' },
  { name: 'Entertainment', color: '#EC4899' },
  { name: 'Shopping', color: '#14B8A6' },
  { name: 'Health', color: '#EF4444' },
  { name: 'Income', color: '#10B981' },
  { name: 'Transfer', color: '#6B7280' },
  { name: 'Other', color: '#9CA3AF' },
]

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6B7280'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_document ON transactions(document_id);
  `)

  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
  if (count.count === 0) {
    const insert = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)')
    for (const cat of SEED_CATEGORIES) {
      insert.run(cat.name, cat.color)
    }
  }
}
