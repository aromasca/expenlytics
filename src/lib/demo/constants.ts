// Demo dataset constants — static data for seeding ~500 realistic transactions

export interface DemoAccount {
  name: string
  institution: string
  lastFour: string
  type: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: 'Chase Freedom', institution: 'Chase', lastFour: '4521', type: 'credit_card' },
  { name: 'Wells Fargo Checking', institution: 'Wells Fargo', lastFour: '7890', type: 'checking' },
  { name: 'Amex Gold', institution: 'American Express', lastFour: '3456', type: 'credit_card' },
  { name: 'Ally Savings', institution: 'Ally Bank', lastFour: '2345', type: 'savings' },
]

export interface FrequencySpec {
  type: 'fixed' | 'variable'
  perMonth?: number              // fixed count per month
  minPerMonth?: number           // variable range
  maxPerMonth?: number
  dayOfMonth?: number            // for fixed monthly bills
  biweekly?: boolean             // for salary
}

export interface DemoMerchant {
  name: string
  rawDescriptions: string[]
  category: string
  transactionClass: 'purchase' | 'payment' | 'transfer' | 'fee' | 'refund'
  type: 'debit' | 'credit'
  amountMin: number
  amountMax: number
  frequency: FrequencySpec
  accountIndex: number           // index into DEMO_ACCOUNTS
  startMonth?: string            // YYYY-MM, inclusive (subscription lifecycle)
  endMonth?: string              // YYYY-MM, inclusive
}

export const DEMO_MERCHANTS: DemoMerchant[] = [
  // Income — biweekly salary via Wells Fargo
  {
    name: 'Acme Corp Payroll',
    rawDescriptions: ['ACME CORP PAYROLL DIR DEP', 'ACME CORP DIRECT DEPOSIT'],
    category: 'Salary & Wages',
    transactionClass: 'purchase',
    type: 'credit',
    amountMin: 3100,
    amountMax: 3100,
    frequency: { type: 'fixed', perMonth: 2, biweekly: true },
    accountIndex: 1,
  },

  // Fixed monthly — Housing
  {
    name: 'Greenwood Apartments',
    rawDescriptions: ['GREENWOOD APT MGMT PMT', 'GREENWOOD APARTMENTS RENT'],
    category: 'Rent & Mortgage',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 1850,
    amountMax: 1850,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 1 },
    accountIndex: 1,
  },
  {
    name: 'City Power & Light',
    rawDescriptions: ['CITY POWER LIGHT UTIL', 'CITY PWR&LT AUTOPAY'],
    category: 'Utilities',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 95,
    amountMax: 185,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 15 },
    accountIndex: 1,
  },
  {
    name: 'Xfinity',
    rawDescriptions: ['COMCAST XFINITY INTERNET', 'XFINITY AUTOPAY'],
    category: 'Internet & Phone',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 79.99,
    amountMax: 79.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 8 },
    accountIndex: 0,
  },
  {
    name: 'T-Mobile',
    rawDescriptions: ['T-MOBILE WIRELESS PMT', 'TMOBILE AUTOPAY'],
    category: 'Internet & Phone',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 85,
    amountMax: 85,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 22 },
    accountIndex: 0,
  },

  // Streaming & subscriptions
  {
    name: 'Netflix',
    rawDescriptions: ['NETFLIX.COM', 'NETFLIX INC'],
    category: 'Streaming Services',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 15.99,
    amountMax: 15.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 12 },
    accountIndex: 0,
  },
  {
    name: 'Spotify',
    rawDescriptions: ['SPOTIFY USA', 'SPOTIFY P*'],
    category: 'Streaming Services',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 10.99,
    amountMax: 10.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 5 },
    accountIndex: 0,
  },
  {
    name: 'Apple iCloud',
    rawDescriptions: ['APPLE.COM/BILL ICLOUD', 'APL*ICLOUD STORAGE'],
    category: 'SaaS & Subscriptions',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 2.99,
    amountMax: 2.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 18 },
    accountIndex: 0,
  },
  {
    name: 'NY Times',
    rawDescriptions: ['NYT DIGITAL SUBSCRIPTION', 'NYTIMES DIGITAL ACCESS'],
    category: 'SaaS & Subscriptions',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 17,
    amountMax: 17,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 20 },
    accountIndex: 2,
  },

  // Subscription lifecycle — starts/ends mid-year
  {
    name: 'Planet Fitness',
    rawDescriptions: ['PLANET FITNESS MONTHLY', 'PLT FIT CLUB FEE'],
    category: 'Fitness & Gym',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 49.99,
    amountMax: 49.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 1 },
    accountIndex: 0,
    endMonth: '2025-09',
  },
  {
    name: 'Hulu',
    rawDescriptions: ['HULU *LIVE TV', 'HULU LLC'],
    category: 'Streaming Services',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 17.99,
    amountMax: 17.99,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 10 },
    accountIndex: 0,
    startMonth: '2025-06',
  },
  {
    name: 'Claude Pro',
    rawDescriptions: ['ANTHROPIC CLAUDE PRO', 'ANTHROPIC*CLAUDE'],
    category: 'AI & Productivity Software',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 20,
    amountMax: 20,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 3 },
    accountIndex: 2,
    startMonth: '2025-08',
  },

  // Insurance
  {
    name: 'GEICO',
    rawDescriptions: ['GEICO AUTO INSURANCE', 'GEICO AUTOPAY'],
    category: 'Car Insurance',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 142,
    amountMax: 142,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 28 },
    accountIndex: 1,
  },
  {
    name: 'Blue Cross Blue Shield',
    rawDescriptions: ['BCBS HEALTH PREMIUM', 'BLUE CROSS BLUE SHIELD'],
    category: 'Health Insurance',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 280,
    amountMax: 280,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 1 },
    accountIndex: 1,
  },

  // Variable spending
  {
    name: 'Whole Foods',
    rawDescriptions: ['WHOLE FOODS MKT #1042', 'WHOLEFDS MKT 10042', 'WHOLE FOODS MARKET'],
    category: 'Groceries',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 35,
    amountMax: 120,
    frequency: { type: 'variable', minPerMonth: 4, maxPerMonth: 6 },
    accountIndex: 0,
  },
  {
    name: 'Trader Joes',
    rawDescriptions: ['TRADER JOE\'S #215', 'TRADER JOES #215'],
    category: 'Groceries',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 25,
    amountMax: 85,
    frequency: { type: 'variable', minPerMonth: 3, maxPerMonth: 5 },
    accountIndex: 0,
  },
  {
    name: 'Various Restaurants',
    rawDescriptions: ['CHIPOTLE ONLINE', 'SWEETGREEN #047', 'SHAKE SHACK #312', 'PANDA EXPRESS #2841', 'OLIVE GARDEN #1847'],
    category: 'Restaurants',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 12,
    amountMax: 65,
    frequency: { type: 'variable', minPerMonth: 5, maxPerMonth: 9 },
    accountIndex: 0,
  },
  {
    name: 'Starbucks',
    rawDescriptions: ['STARBUCKS #14829', 'STARBUCKS STORE 14829', 'SQ *STARBUCKS'],
    category: 'Coffee & Cafes',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 4.5,
    amountMax: 8.75,
    frequency: { type: 'variable', minPerMonth: 8, maxPerMonth: 14 },
    accountIndex: 0,
  },
  {
    name: 'Shell',
    rawDescriptions: ['SHELL OIL #57219', 'SHELL SERVICE STATION'],
    category: 'Gas & Fuel',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 35,
    amountMax: 62,
    frequency: { type: 'variable', minPerMonth: 2, maxPerMonth: 4 },
    accountIndex: 1,
  },
  {
    name: 'Uber',
    rawDescriptions: ['UBER *TRIP', 'UBER *EATS', 'UBER TECHNOLOGIES'],
    category: 'Rideshare & Taxi',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 8,
    amountMax: 35,
    frequency: { type: 'variable', minPerMonth: 2, maxPerMonth: 5 },
    accountIndex: 0,
  },
  {
    name: 'Amazon',
    rawDescriptions: ['AMAZON.COM*', 'AMZN MKTP US*', 'AMAZON PRIME*'],
    category: 'General Merchandise',
    transactionClass: 'purchase',
    type: 'debit',
    amountMin: 12,
    amountMax: 89,
    frequency: { type: 'variable', minPerMonth: 2, maxPerMonth: 4 },
    accountIndex: 2,
  },

  // Transfers
  {
    name: 'Savings Transfer',
    rawDescriptions: ['ONLINE TRANSFER TO ALLY SAVINGS', 'TRANSFER TO SAVINGS ****2345'],
    category: 'Transfer',
    transactionClass: 'transfer',
    type: 'debit',
    amountMin: 500,
    amountMax: 500,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 2 },
    accountIndex: 1,
  },
  {
    name: 'Chase CC Payment',
    rawDescriptions: ['CHASE CREDIT CRD AUTOPAY', 'PAYMENT THANK YOU'],
    category: 'Transfer',
    transactionClass: 'payment',
    type: 'credit',
    amountMin: 800,
    amountMax: 1600,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 25 },
    accountIndex: 0,
  },
  {
    name: 'Amex Payment',
    rawDescriptions: ['AMEX EPAYMENT ACH PMT', 'AMERICAN EXPRESS ACH PMT'],
    category: 'Transfer',
    transactionClass: 'payment',
    type: 'credit',
    amountMin: 200,
    amountMax: 500,
    frequency: { type: 'fixed', perMonth: 1, dayOfMonth: 20 },
    accountIndex: 2,
  },
]

export interface DemoOneOff {
  name: string
  rawDescription: string
  category: string
  transactionClass: 'purchase' | 'refund' | 'fee'
  type: 'debit' | 'credit'
  amount: number
  month: string     // YYYY-MM
  day: number
  accountIndex: number
}

export const DEMO_ONE_OFFS: DemoOneOff[] = [
  { name: 'Best Buy', rawDescription: 'BEST BUY #00542 LAPTOP', category: 'Electronics', transactionClass: 'purchase', type: 'debit', amount: 899.99, month: '2025-03', day: 14, accountIndex: 0 },
  { name: 'Jiffy Lube', rawDescription: 'JIFFY LUBE #2847 CAR REPAIR', category: 'Car Maintenance', transactionClass: 'purchase', type: 'debit', amount: 450, month: '2025-05', day: 22, accountIndex: 1 },
  { name: 'Dr. Smith Office', rawDescription: 'DR SMITH MEDICAL OFFICE', category: 'Medical & Dental', transactionClass: 'purchase', type: 'debit', amount: 250, month: '2025-04', day: 8, accountIndex: 1 },
  { name: 'Ticketmaster', rawDescription: 'TICKETMASTER CONCERT TIX', category: 'Music & Concerts', transactionClass: 'purchase', type: 'debit', amount: 340, month: '2025-07', day: 19, accountIndex: 2 },
  { name: 'Delta Airlines', rawDescription: 'DELTA AIR LINES #0847', category: 'Flights', transactionClass: 'purchase', type: 'debit', amount: 380, month: '2025-08', day: 5, accountIndex: 2 },
  { name: 'Marriott Hotels', rawDescription: 'MARRIOTT HOTEL DOWNTOWN', category: 'Hotels & Lodging', transactionClass: 'purchase', type: 'debit', amount: 520, month: '2025-08', day: 12, accountIndex: 2 },
  { name: 'Target', rawDescription: 'TARGET #1284 HOLIDAY GIFTS', category: 'Gifts', transactionClass: 'purchase', type: 'debit', amount: 285, month: '2025-11', day: 25, accountIndex: 0 },
  { name: 'Nordstrom', rawDescription: 'NORDSTROM #0847 GIFTS', category: 'Gifts', transactionClass: 'purchase', type: 'debit', amount: 195, month: '2025-12', day: 15, accountIndex: 0 },
  { name: 'REI', rawDescription: 'REI #42 CAMPING GEAR', category: 'Sporting Goods', transactionClass: 'purchase', type: 'debit', amount: 167.50, month: '2025-06', day: 3, accountIndex: 2 },
  { name: 'Amazon Refund', rawDescription: 'AMZN MKTP US REFUND', category: 'Refund', transactionClass: 'refund', type: 'credit', amount: 45.99, month: '2025-04', day: 15, accountIndex: 2 },
  { name: 'Foreign Transaction Fee', rawDescription: 'FOREIGN TRANSACTION FEE', category: 'Fees & Charges', transactionClass: 'fee', type: 'debit', amount: 3.50, month: '2025-08', day: 13, accountIndex: 2 },
  { name: 'CVS Pharmacy', rawDescription: 'CVS PHARMACY #4827', category: 'Pharmacy', transactionClass: 'purchase', type: 'debit', amount: 32.47, month: '2025-09', day: 7, accountIndex: 0 },
]
