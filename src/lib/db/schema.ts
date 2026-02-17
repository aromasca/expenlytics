import type Database from 'better-sqlite3'

const SEED_CATEGORIES = [
  // Food & Drink
  { name: 'Groceries', color: '#22C55E', group: 'Food & Drink' },
  { name: 'Restaurants', color: '#F97316', group: 'Food & Drink' },
  { name: 'Coffee & Cafes', color: '#FB923C', group: 'Food & Drink' },
  { name: 'Fast Food', color: '#FDBA74', group: 'Food & Drink' },
  { name: 'Food Delivery', color: '#EA580C', group: 'Food & Drink' },
  { name: 'Bars & Alcohol', color: '#C2410C', group: 'Food & Drink' },
  // Transportation
  { name: 'Gas & Fuel', color: '#A855F7', group: 'Transportation' },
  { name: 'Public Transit', color: '#3B82F6', group: 'Transportation' },
  { name: 'Rideshare & Taxi', color: '#6366F1', group: 'Transportation' },
  { name: 'Parking & Tolls', color: '#64748B', group: 'Transportation' },
  { name: 'Car Maintenance', color: '#7C3AED', group: 'Transportation' },
  { name: 'Car Payment', color: '#8B5CF6', group: 'Transportation' },
  { name: 'Car Insurance', color: '#9333EA', group: 'Transportation' },
  // Housing
  { name: 'Rent & Mortgage', color: '#0284C7', group: 'Housing' },
  { name: 'Utilities', color: '#EAB308', group: 'Housing' },
  { name: 'Internet & Phone', color: '#CA8A04', group: 'Housing' },
  { name: 'Home Maintenance', color: '#D946EF', group: 'Housing' },
  { name: 'Home Improvement', color: '#C026D3', group: 'Housing' },
  { name: 'Furniture & Decor', color: '#A21CAF', group: 'Housing' },
  { name: 'Home Insurance', color: '#86198F', group: 'Housing' },
  // Shopping
  { name: 'Clothing & Accessories', color: '#14B8A6', group: 'Shopping' },
  { name: 'Electronics', color: '#2563EB', group: 'Shopping' },
  { name: 'Office Supplies', color: '#1D4ED8', group: 'Shopping' },
  { name: 'Home Goods', color: '#0D9488', group: 'Shopping' },
  { name: 'Books', color: '#0F766E', group: 'Shopping' },
  { name: 'Sporting Goods', color: '#115E59', group: 'Shopping' },
  { name: 'General Merchandise', color: '#134E4A', group: 'Shopping' },
  // Health & Wellness
  { name: 'Health Insurance', color: '#BE185D', group: 'Health & Wellness' },
  { name: 'Medical & Dental', color: '#EF4444', group: 'Health & Wellness' },
  { name: 'Pharmacy', color: '#DC2626', group: 'Health & Wellness' },
  { name: 'Fitness & Gym', color: '#F43F5E', group: 'Health & Wellness' },
  { name: 'Mental Health', color: '#E11D48', group: 'Health & Wellness' },
  { name: 'Vision & Eye Care', color: '#B91C1C', group: 'Health & Wellness' },
  // Entertainment
  { name: 'Movies & Theater', color: '#EC4899', group: 'Entertainment' },
  { name: 'Music & Concerts', color: '#DB2777', group: 'Entertainment' },
  { name: 'Gaming', color: '#BE185D', group: 'Entertainment' },
  { name: 'Streaming Services', color: '#0EA5E9', group: 'Entertainment' },
  { name: 'Sports & Outdoors', color: '#F472B6', group: 'Entertainment' },
  { name: 'Hobbies', color: '#A855F7', group: 'Entertainment' },
  // Personal
  { name: 'Personal Care & Beauty', color: '#F9A8D4', group: 'Personal' },
  { name: 'Haircuts & Salon', color: '#F472B6', group: 'Personal' },
  { name: 'Laundry & Dry Cleaning', color: '#E879F9', group: 'Personal' },
  // Education
  { name: 'Tuition & School Fees', color: '#7C3AED', group: 'Education' },
  { name: 'Books & Supplies', color: '#6D28D9', group: 'Education' },
  { name: 'Online Courses', color: '#5B21B6', group: 'Education' },
  // Kids & Family
  { name: 'Childcare', color: '#8B5CF6', group: 'Kids & Family' },
  { name: 'Kids Activities', color: '#7C3AED', group: 'Kids & Family' },
  { name: 'Baby & Kids Supplies', color: '#6D28D9', group: 'Kids & Family' },
  // Pets
  { name: 'Pet Food & Supplies', color: '#EA580C', group: 'Pets' },
  { name: 'Veterinary', color: '#C2410C', group: 'Pets' },
  { name: 'Pet Services', color: '#9A3412', group: 'Pets' },
  // Travel
  { name: 'Flights', color: '#0891B2', group: 'Travel' },
  { name: 'Hotels & Lodging', color: '#0E7490', group: 'Travel' },
  { name: 'Rental Cars', color: '#155E75', group: 'Travel' },
  { name: 'Travel Activities', color: '#164E63', group: 'Travel' },
  { name: 'Travel Insurance', color: '#083344', group: 'Travel' },
  // Financial
  { name: 'Fees & Charges', color: '#DC2626', group: 'Financial' },
  { name: 'Interest & Finance Charges', color: '#B91C1C', group: 'Financial' },
  { name: 'Taxes', color: '#991B1B', group: 'Financial' },
  { name: 'Investments', color: '#7F1D1D', group: 'Financial' },
  { name: 'Savings', color: '#450A0A', group: 'Financial' },
  // Gifts & Giving
  { name: 'Gifts', color: '#E11D48', group: 'Gifts & Giving' },
  { name: 'Charitable Donations', color: '#BE123C', group: 'Gifts & Giving' },
  // Income & Transfers
  { name: 'Salary & Wages', color: '#10B981', group: 'Income & Transfers' },
  { name: 'Freelance Income', color: '#059669', group: 'Income & Transfers' },
  { name: 'Refund', color: '#047857', group: 'Income & Transfers' },
  { name: 'Transfer', color: '#6B7280', group: 'Income & Transfers' },
  { name: 'ATM Withdrawal', color: '#4B5563', group: 'Income & Transfers' },
  // Software & Services
  { name: 'AI & Productivity Software', color: '#6366F1', group: 'Software & Services' },
  { name: 'SaaS & Subscriptions', color: '#818CF8', group: 'Software & Services' },
  // Other
  { name: 'Other', color: '#9CA3AF', group: 'Other' },
]

// Mapping from old category names to new ones (for migration)
const OLD_TO_NEW_CATEGORY: Record<string, string> = {
  'Restaurants & Dining': 'Restaurants',
  'Subscriptions': 'Streaming Services',
  'Shopping': 'General Merchandise',
  'Health & Medical': 'Medical & Dental',
  'Fitness': 'Fitness & Gym',
  'Insurance': 'Health Insurance',
  'Childcare & Education': 'Tuition & School Fees',
  'Pets': 'Pet Food & Supplies',
  'Travel': 'Travel Activities',
  'Entertainment': 'Movies & Theater',
  'Gifts & Donations': 'Gifts',
  'Personal Care': 'Personal Care & Beauty',
  'Income': 'Salary & Wages',
}

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
      color TEXT NOT NULL DEFAULT '#6B7280',
      category_group TEXT NOT NULL DEFAULT 'Other'
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

  // Accounts table — auto-detected from uploaded statements
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT,
      last_four TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Junction table for multi-account documents (e.g., combined checking+savings statements)
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_accounts (
      document_id INTEGER NOT NULL REFERENCES documents(id),
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      statement_month TEXT,
      statement_date TEXT,
      PRIMARY KEY (document_id, account_id)
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_document_accounts_account ON document_accounts(account_id)')

  // Migrate existing tables - add new columns if they don't exist
  const columns = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>
  const columnNames = columns.map(c => c.name)

  if (!columnNames.includes('file_hash')) {
    db.exec('ALTER TABLE documents ADD COLUMN file_hash TEXT NOT NULL DEFAULT ""')
  }
  if (!columnNames.includes('document_type')) {
    db.exec('ALTER TABLE documents ADD COLUMN document_type TEXT')
  }
  if (!columnNames.includes('processing_phase')) {
    db.exec('ALTER TABLE documents ADD COLUMN processing_phase TEXT')
  }
  if (!columnNames.includes('raw_extraction')) {
    db.exec('ALTER TABLE documents ADD COLUMN raw_extraction TEXT')
  }
  if (!columnNames.includes('transaction_count')) {
    db.exec('ALTER TABLE documents ADD COLUMN transaction_count INTEGER')
  }
  if (!columnNames.includes('account_id')) {
    db.exec('ALTER TABLE documents ADD COLUMN account_id INTEGER REFERENCES accounts(id)')
  }
  if (!columnNames.includes('statement_month')) {
    db.exec('ALTER TABLE documents ADD COLUMN statement_month TEXT')
  }
  if (!columnNames.includes('statement_date')) {
    db.exec('ALTER TABLE documents ADD COLUMN statement_date TEXT')
  }

  const txnColumns = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>
  const txnColumnNames = txnColumns.map(c => c.name)

  if (!txnColumnNames.includes('manual_category')) {
    db.exec('ALTER TABLE transactions ADD COLUMN manual_category INTEGER NOT NULL DEFAULT 0')
  }

  if (!txnColumnNames.includes('normalized_merchant')) {
    db.exec('ALTER TABLE transactions ADD COLUMN normalized_merchant TEXT')
  }

  if (!txnColumnNames.includes('transaction_class')) {
    db.exec("ALTER TABLE transactions ADD COLUMN transaction_class TEXT CHECK (transaction_class IN ('purchase', 'payment', 'refund', 'fee', 'interest', 'transfer'))")
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_class ON transactions(transaction_class)')

  // Create index for recurring charge queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_normalized_merchant ON transactions(normalized_merchant)')

  // Create index on file_hash after migration
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_documents_account ON documents(account_id)')

  // Insight cache table for LLM-generated insights
  db.exec(`
    CREATE TABLE IF NOT EXISTS insight_cache (
      cache_key TEXT UNIQUE NOT NULL,
      insight_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `)

  // Dismissed insights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_insights (
      insight_id TEXT UNIQUE NOT NULL,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Settings table for configurable options (e.g., model selection)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Merchant classification memory — records merchant→category mappings
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchant_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_merchant TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      source TEXT NOT NULL DEFAULT 'auto',
      confidence REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Dismissed subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dismissed_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_merchant TEXT NOT NULL UNIQUE,
      dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Commitment status table (replaces subscription_status)
  db.exec(`
    CREATE TABLE IF NOT EXISTS commitment_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_merchant TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ended', 'not_recurring')),
      status_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    )
  `)

  // Migrate dismissed_subscriptions → commitment_status
  db.exec(`
    INSERT OR IGNORE INTO commitment_status (normalized_merchant, status, status_changed_at)
    SELECT normalized_merchant, 'not_recurring', dismissed_at
    FROM dismissed_subscriptions
  `)

  // Migrate subscription_status → commitment_status (renamed table)
  const hasOldStatusTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='subscription_status'"
  ).get()
  if (hasOldStatusTable) {
    db.exec(`
      INSERT OR IGNORE INTO commitment_status (normalized_merchant, status, status_changed_at, notes)
      SELECT normalized_merchant, status, status_changed_at, notes
      FROM subscription_status
    `)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS excluded_commitment_transactions (
      transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE
    )
  `)

  // Migrate excluded_recurring_transactions → excluded_commitment_transactions (renamed table)
  const hasOldExcludedTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='excluded_recurring_transactions'"
  ).get()
  if (hasOldExcludedTable) {
    db.exec(`
      INSERT OR IGNORE INTO excluded_commitment_transactions (transaction_id)
      SELECT transaction_id
      FROM excluded_recurring_transactions
    `)
  }

  // Migrate categories table - add new columns if missing
  const catColumns = db.prepare("PRAGMA table_info(categories)").all() as Array<{ name: string }>
  const catColumnNames = catColumns.map(c => c.name)
  if (!catColumnNames.includes('category_group')) {
    db.exec("ALTER TABLE categories ADD COLUMN category_group TEXT NOT NULL DEFAULT 'Other'")
  }
  if (!catColumnNames.includes('exclude_from_totals')) {
    db.exec('ALTER TABLE categories ADD COLUMN exclude_from_totals INTEGER DEFAULT 0')
  }

  // Seed or migrate categories
  const existingCats = db.prepare('SELECT name FROM categories').all() as Array<{ name: string }>
  const existingNames = new Set(existingCats.map(c => c.name))

  if (existingCats.length === 0) {
    // Fresh DB: insert all new categories
    const insert = db.prepare('INSERT INTO categories (name, color, category_group) VALUES (?, ?, ?)')
    for (const cat of SEED_CATEGORIES) {
      insert.run(cat.name, cat.color, cat.group)
    }
  } else if (!existingNames.has('Coffee & Cafes')) {
    // Old taxonomy detected: migrate old → new names, then insert new categories
    const rename = db.prepare('UPDATE categories SET name = ?, color = ?, category_group = ? WHERE name = ?')
    for (const [oldName, newName] of Object.entries(OLD_TO_NEW_CATEGORY)) {
      const newCat = SEED_CATEGORIES.find(c => c.name === newName)!
      rename.run(newName, newCat.color, newCat.group, oldName)
    }
    // Update group for categories that kept their name
    const updateGroup = db.prepare('UPDATE categories SET category_group = ?, color = ? WHERE name = ?')
    for (const cat of SEED_CATEGORIES) {
      if (existingNames.has(cat.name) && !OLD_TO_NEW_CATEGORY[cat.name]) {
        updateGroup.run(cat.group, cat.color, cat.name)
      }
    }
    // Insert new categories that didn't exist before
    const insert = db.prepare('INSERT OR IGNORE INTO categories (name, color, category_group) VALUES (?, ?, ?)')
    for (const cat of SEED_CATEGORIES) {
      if (!existingNames.has(cat.name) && !Object.values(OLD_TO_NEW_CATEGORY).includes(cat.name)) {
        insert.run(cat.name, cat.color, cat.group)
      }
      // Also insert renamed targets that weren't already inserted by the rename
      if (Object.values(OLD_TO_NEW_CATEGORY).includes(cat.name)) {
        insert.run(cat.name, cat.color, cat.group)
      }
    }
  }

  // Always insert any missing seed categories (handles newly added categories)
  const insertMissing = db.prepare('INSERT OR IGNORE INTO categories (name, color, category_group) VALUES (?, ?, ?)')
  for (const cat of SEED_CATEGORIES) {
    insertMissing.run(cat.name, cat.color, cat.group)
  }

  // Set exclude_from_totals flag for transfer/non-spending categories
  db.exec(`UPDATE categories SET exclude_from_totals = 1 WHERE name IN ('Transfer', 'Refund', 'Savings', 'Investments')`)
}
