import type Database from 'better-sqlite3'

const SEED_CATEGORIES = [
  { name: 'Groceries', color: '#22C55E' },
  { name: 'Restaurants & Dining', color: '#F97316' },
  { name: 'Gas & Fuel', color: '#A855F7' },
  { name: 'Public Transit', color: '#3B82F6' },
  { name: 'Rideshare & Taxi', color: '#6366F1' },
  { name: 'Parking & Tolls', color: '#64748B' },
  { name: 'Rent & Mortgage', color: '#8B5CF6' },
  { name: 'Home Maintenance', color: '#D946EF' },
  { name: 'Utilities', color: '#EAB308' },
  { name: 'Subscriptions', color: '#0EA5E9' },
  { name: 'Shopping', color: '#14B8A6' },
  { name: 'Electronics', color: '#2563EB' },
  { name: 'Health & Medical', color: '#EF4444' },
  { name: 'Fitness', color: '#F43F5E' },
  { name: 'Insurance', color: '#BE185D' },
  { name: 'Childcare & Education', color: '#7C3AED' },
  { name: 'Pets', color: '#EA580C' },
  { name: 'Travel', color: '#0891B2' },
  { name: 'Entertainment', color: '#EC4899' },
  { name: 'Gifts & Donations', color: '#E11D48' },
  { name: 'Personal Care', color: '#F472B6' },
  { name: 'Income', color: '#10B981' },
  { name: 'Transfer', color: '#6B7280' },
  { name: 'Refund', color: '#059669' },
  { name: 'Fees & Charges', color: '#DC2626' },
  { name: 'Other', color: '#9CA3AF' },
]

export function initializeSchema(db: Database.Database): void {
  // Create base tables (without new columns for backward compatibility)
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

  // Migrate existing tables - add new columns if they don't exist
  const columns = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>
  const columnNames = columns.map(c => c.name)

  if (!columnNames.includes('file_hash')) {
    db.exec('ALTER TABLE documents ADD COLUMN file_hash TEXT NOT NULL DEFAULT ""')
  }
  if (!columnNames.includes('document_type')) {
    db.exec('ALTER TABLE documents ADD COLUMN document_type TEXT')
  }

  const txnColumns = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>
  const txnColumnNames = txnColumns.map(c => c.name)

  if (!txnColumnNames.includes('manual_category')) {
    db.exec('ALTER TABLE transactions ADD COLUMN manual_category INTEGER NOT NULL DEFAULT 0')
  }

  // Create index on file_hash after migration
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash)')

  // Seed or update categories
  const count = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
  if (count.count === 0) {
    const insert = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)')
    for (const cat of SEED_CATEGORIES) {
      insert.run(cat.name, cat.color)
    }
  } else if (count.count < 26) {
    // Update to new categories - insert missing ones
    const existing = db.prepare('SELECT name FROM categories').all() as Array<{ name: string }>
    const existingNames = new Set(existing.map(c => c.name))
    const insert = db.prepare('INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)')
    for (const cat of SEED_CATEGORIES) {
      if (!existingNames.has(cat.name)) {
        insert.run(cat.name, cat.color)
      }
    }
  }
}
