import type { PromptTemplate } from '../types'

// Shared extraction instructions — used by both RAW (PDF-as-image) and TEXT (pre-extracted) paths
const EXTRACTION_CORE = `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions.

## Step 1: Identify Document Type

Choose one:
- "credit_card" — credit card statement
- "checking_account" — checking/current account statement
- "savings_account" — savings account statement
- "investment" — investment/brokerage statement
- "other" — any other financial document

## Step 1b: Extract Account Identity (if visible)

If the statement shows account information, extract:
- **account_name**: the account or card name (e.g., "Sapphire Reserve", "Platinum Checking")
- **institution**: the bank or financial institution (e.g., "Chase", "Bank of America", "Wells Fargo")
- **last_four**: the last 4 digits of the account or card number
- **statement_month**: the billing period month in YYYY-MM format (use the statement closing date or period ending date)
- **statement_date**: the exact statement period or closing date as printed (e.g., "June 24 - July 23, 2025")

These fields are optional — only include them if clearly visible on the statement.

## Step 2: Extract Every Transaction

For each transaction, extract:
- **date**: in YYYY-MM-DD format
- **description**: merchant name or transaction description (clean up codes/numbers, make human-readable)
- **amount**: as a positive number (no currency symbols)
- **type**: "debit" or "credit" based on document type context (see below)
- **transaction_class**: structural classification (see transaction class rules below)

## Document Type Context

This determines how to interpret debits and credits:
- **Credit card**: debits are purchases/charges, credits are payments to the card or refunds.
- **Checking/savings account**: debits are money out (spending, transfers), credits are money in (salary, deposits).
- **Investment**: debits are contributions/purchases, credits are withdrawals/dividends.

## Transaction Class Rules

Classify each transaction structurally:
- **"purchase"**: regular spending — purchases, bills, subscriptions, loan payments, car payments, insurance premiums, rent, mortgage payments. This is the DEFAULT for any debit that is spending money on goods or services
- **"payment"**: ONLY for credit card payments received (credits on a CC statement when you pay your bill)
- **"refund"**: returned purchases, merchant credits, chargebacks, reimbursements, insurance claim payouts. Any credit that reverses or reimburses a previous purchase — even partial refunds
- **"fee"**: bank fees, late fees, service charges, overdraft fees, annual fees
- **"interest"**: interest charges OR interest earned. Finance charges on credit cards/loans, and also interest credits on savings/checking accounts
- **"transfer"**: ONLY inter-account money movements — CC bill payments FROM checking, transfers to savings/investments, 401k contributions, P2P self-transfers (Venmo/Zelle to yourself), ACH between your own accounts

### Critical Distinctions
- A debit for "Porsche Financial Payment" or "Auto Loan" → **"purchase"** (spending on a car loan, NOT a transfer)
- A debit for "State Farm Insurance" → **"purchase"** (spending on insurance, NOT a transfer)
- A credit from "State Farm" or "GEICO" on checking → **"refund"** (insurance claim payout / reimbursement)
- A credit from "Home Depot" or any merchant on checking → **"refund"** (return or credit, NOT income)
- A credit for salary/wages/payroll → **"purchase"** (income deposit — use purchase for non-transfer credits)
- Interest earned on savings/checking → **"interest"**
- Only use **"transfer"** for money moving between YOUR OWN accounts

## Output Format

Return ONLY valid JSON in this exact format:
\`\`\`json
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "account_name": "optional account name",
  "institution": "optional institution name",
  "last_four": "optional last 4 digits",
  "statement_month": "optional YYYY-MM",
  "statement_date": "optional exact date text from document",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit", "transaction_class": "purchase|payment|refund|fee|interest|transfer"}
  ]
}
\`\`\`

## Foreign Currency Transactions
- When a transaction shows a foreign currency amount and exchange rate (e.g., "4,963.00 X 0.316274430 (EXCHG RATE)"), this is ONE transaction, not two
- The foreign currency line, exchange rate, and converted amount are supplementary details of the main transaction
- Extract only ONE transaction using the converted/USD amount and the merchant name
- Do NOT create a separate "currency exchange" transaction from the exchange rate line

## Important Rules
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Every transaction MUST have a transaction_class
- Do NOT assign categories — only extract raw transaction data`

const CATEGORY_GUIDE = `
## Classification Approach

Think in two steps: first identify which GROUP the transaction belongs to, then pick the most specific category within that group.

## Category Guide (organized by group)

### Food & Drink
- Groceries: supermarkets, food stores (Whole Foods, Trader Joe's, Kroger, Safeway, Costco food)
- Restaurants: sit-down restaurants, diners (Olive Garden, Cheesecake Factory, local restaurants)
- Coffee & Cafes: coffee shops, tea shops (Starbucks, Dunkin', Peet's, local cafes)
- Fast Food: quick service, drive-through (McDonald's, Chick-fil-A, Taco Bell, Wendy's)
- Food Delivery: delivery apps and services (DoorDash, Uber Eats, Grubhub, Instacart)
- Bars & Alcohol: bars, breweries, liquor stores, wine shops

### Transportation
- Gas & Fuel: gas stations, EV charging (Shell, Chevron, BP, ChargePoint)
- Public Transit: bus, subway, rail, transit passes (MTA, BART, metro cards)
- Rideshare & Taxi: ride services (Uber, Lyft, taxis)
- Parking & Tolls: parking garages, meters, toll charges, E-ZPass
- Car Maintenance: oil changes, repairs, tires, car wash, inspections
- Car Payment: auto loan payments, car lease payments
- Car Insurance: auto insurance premiums (GEICO, State Farm, Progressive)

### Housing
- Rent & Mortgage: rent payments, mortgage payments, HOA fees
- Utilities: electric, water, gas, sewer, trash (PG&E, ConEd, water bills)
- Internet & Phone: internet, cable TV, cell phone bills (Comcast, Verizon, AT&T, T-Mobile)
- Home Maintenance: repairs, cleaning, contractors, plumbers, electricians, lawn care
- Home Improvement: renovations, hardware stores (Home Depot, Lowe's), paint, tools
- Furniture & Decor: furniture, home decor, rugs, curtains (IKEA, Pottery Barn, Wayfair)
- Home Insurance: homeowner's/renter's insurance

### Shopping
- Clothing & Accessories: apparel, shoes, jewelry, handbags (Zara, Nike, H&M, Nordstrom)
- Electronics: computers, phones, gadgets, tech accessories (Apple, Best Buy, B&H)
- Office Supplies: office and stationery items (Staples, Office Depot, printer ink)
- Home Goods: kitchenware, bedding, bath items (Target home, Bed Bath, Crate & Barrel)
- Books: bookstores, e-books (Barnes & Noble, Kindle, Audible)
- Sporting Goods: sports equipment, outdoor gear (REI, Dick's, Bass Pro)
- General Merchandise: Amazon (non-specific), Walmart, Target (general), dollar stores

### Health & Wellness
- Health Insurance: health/medical insurance premiums
- Medical & Dental: doctor visits, hospital, dental, urgent care, lab work
- Pharmacy: prescriptions, drugstores (CVS, Walgreens, Rite Aid)
- Fitness & Gym: gym memberships, fitness classes, sports equipment (Planet Fitness, CrossFit, Peloton)
- Mental Health: therapy, counseling, psychiatry, meditation apps (BetterHelp, Calm, Headspace)
- Vision & Eye Care: eye exams, glasses, contacts, optometrist

### Entertainment
- Movies & Theater: movie tickets, theaters, plays (AMC, Regal, Broadway)
- Music & Concerts: concert tickets, live music venues, music purchases
- Gaming: video games, gaming subscriptions, game consoles (Steam, Xbox, PlayStation, Nintendo)
- Streaming Services: streaming subscriptions (Netflix, Spotify, Disney+, HBO Max, YouTube Premium)
- Sports & Outdoors: sports events, tickets, leagues, outdoor recreation
- Hobbies: craft supplies, hobby materials, collectibles, art supplies

### Personal
- Personal Care & Beauty: cosmetics, skincare, personal hygiene (Sephora, Ulta, bath products)
- Haircuts & Salon: haircuts, coloring, barber shops, nail salons, spa services
- Laundry & Dry Cleaning: laundromat, dry cleaners, wash & fold services

### Education
- Tuition & School Fees: tuition, school fees, college expenses
- Books & Supplies: textbooks, school supplies, educational materials
- Online Courses: online learning platforms (Coursera, Udemy, Skillshare, MasterClass)

### Kids & Family
- Childcare: daycare, nannies, babysitters, after-school programs
- Kids Activities: children's classes, camps, sports leagues, birthday parties
- Baby & Kids Supplies: diapers, baby gear, children's clothing, toys

### Pets
- Pet Food & Supplies: pet food, treats, toys, accessories (Chewy, PetSmart, Petco)
- Veterinary: vet visits, pet medications, pet health
- Pet Services: grooming, boarding, pet sitting, dog walking (Rover, Wag)

### Travel
- Flights: airline tickets, baggage fees (United, Delta, Southwest, JetBlue)
- Hotels & Lodging: hotels, Airbnb, motels, resorts, hostels
- Rental Cars: car rentals (Hertz, Enterprise, Turo)
- Travel Activities: tours, excursions, attractions, museums while traveling
- Travel Insurance: trip insurance, travel protection plans

### Financial
- Fees & Charges: bank fees, late fees, service charges, overdraft fees
- Interest & Finance Charges: credit card interest, loan interest, finance charges
- Taxes: tax payments, tax preparation services (TurboTax, H&R Block)
- Investments: brokerage contributions, stock purchases, retirement contributions
- Savings: savings account transfers, emergency fund contributions

### Gifts & Giving
- Gifts: presents, gift cards purchased for others, flowers (1-800-Flowers)
- Charitable Donations: charity, nonprofits, religious organizations, GoFundMe, tips

### Income & Transfers
- Salary & Wages: payroll, salary deposits (ONLY for checking/savings — NEVER for credit card)
- Freelance Income: 1099 income, contract work, side gig payments
- Refund: returns, reimbursements, chargebacks, merchant credits
- Transfer: account transfers, credit card bill payments, Venmo/Zelle/PayPal transfers
- ATM Withdrawal: ATM cash withdrawals

### Other
- Other: anything that truly doesn't fit above — use sparingly

## Transfer Identification (debit side — critical for accurate totals)
- Credit card bill payments from checking → "Transfer"
- Transfers to savings/investment accounts → "Savings" or "Investments"
- P2P payments to yourself (Venmo, Zelle, PayPal self-transfers) → "Transfer"
- ACH transfers between own accounts → "Transfer"
- Wire transfers between own accounts → "Transfer"
- 401k/brokerage contributions → "Investments"
- Savings account contributions → "Savings"

## Disambiguation Rules
- Amazon: default to "General Merchandise" unless description clearly indicates a specific category (e.g., "AMZN Kindle" → "Books", "Amazon Fresh" → "Groceries")
- Costco/Sam's Club/BJ's: "Groceries" for food purchases, "General Merchandise" for non-food bulk items
- Target/Walmart: "Groceries" if description indicates grocery, otherwise "General Merchandise"
- Starbucks/Dunkin: "Coffee & Cafes" (NOT Restaurants or Fast Food)
- DoorDash/Uber Eats/Grubhub: "Food Delivery" (NOT Restaurants)
- Netflix/Spotify/Disney+/Hulu: "Streaming Services" (NOT a general subscription category)
- Gym memberships: "Fitness & Gym" (NOT Streaming Services even though recurring)
- Venmo/Zelle/PayPal: "Transfer" unless context clearly indicates a purchase
- ATM withdrawals: "ATM Withdrawal" (NOT Fees & Charges unless it's specifically the ATM fee)
- Internet/cable/phone: "Internet & Phone" (NOT Utilities)
- Auto insurance: "Car Insurance" (NOT Health Insurance)
- Home/renter's insurance: "Home Insurance" (NOT Health Insurance)`

// RAW: for PDF-as-image extraction (sent as document to LLM)
export function getRawExtractionPrompt(): PromptTemplate {
  return { user: EXTRACTION_CORE }
}

// TEXT: for pre-extracted text (pdf-parse output sent as text)
export function getTextExtractionPrompt(): PromptTemplate {
  return {
    user: `You are a precise financial statement text parser. You will receive pre-extracted text from a financial statement (bank statement, credit card statement, savings account statement, or investment statement). Parse the text and extract ALL transactions.

${EXTRACTION_CORE.replace('You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions.\n\n', '')}

## Extracted Text

{extracted_text}`,
  }
}

// LEGACY: combined extraction + classification in one LLM call
export function getLegacyExtractionPrompt(): PromptTemplate {
  return {
    user: `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions with context-aware categorization.

## Step 1: Identify Document Type

Choose one:
- "credit_card" — credit card statement
- "checking_account" — checking/current account statement
- "savings_account" — savings account statement
- "investment" — investment/brokerage statement
- "other" — any other financial document

## Step 2: Extract Every Transaction

For each transaction, extract:
- **date**: in YYYY-MM-DD format
- **description**: merchant name or transaction description (clean up codes/numbers, make human-readable)
- **amount**: as a positive number (no currency symbols)
- **type**: "debit" or "credit" based on document type context (see below)
- **category**: classify into exactly one of the categories listed below
- **transaction_class**: structural classification — "purchase", "payment", "refund", "fee", "interest", or "transfer"

## Document Type Context

This determines how to interpret debits and credits:
- **Credit card**: debits are purchases/charges, credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" for credit card credits — use "Transfer" for payments/transfers to the card, "Refund" for returned purchases.
- **Checking/savings account**: debits are money out (spending, transfers), credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- **Investment**: debits are contributions/purchases, credits are withdrawals/dividends.

## Transaction Class (structural — orthogonal to category)
- **"purchase"**: regular spending — purchases, bills, subscriptions, loan payments, car payments, insurance premiums, rent, mortgage. DEFAULT for any debit that is spending on goods/services. Also use for salary/income credits
- **"payment"**: ONLY for credit card payments received (credits on a CC statement when you pay your bill)
- **"refund"**: returned purchases, merchant credits, chargebacks, reimbursements, insurance claim payouts. Any credit that reverses a previous purchase
- **"fee"**: bank fees, late fees, service charges, overdraft fees
- **"interest"**: interest charges OR interest earned (finance charges and interest credits)
- **"transfer"**: ONLY inter-account money movements — CC bill payments FROM checking, transfers to savings/investments, P2P self-transfers

**CRITICAL**: A debit for a loan/car/insurance payment → "purchase" (NOT "transfer"). A credit from a merchant → "refund" (NOT "payment")
${CATEGORY_GUIDE}

## Output Format

Return ONLY valid JSON in this exact format:
\`\`\`json
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit", "category": "...", "transaction_class": "purchase|payment|refund|fee|interest|transfer"}
  ]
}
\`\`\`

## Foreign Currency Transactions
- When a transaction shows a foreign currency amount and exchange rate (e.g., "4,963.00 X 0.316274430 (EXCHG RATE)"), this is ONE transaction, not two
- The foreign currency line, exchange rate, and converted amount are supplementary details of the main transaction
- Extract only ONE transaction using the converted/USD amount and the merchant name
- Do NOT create a separate "currency exchange" transaction from the exchange rate line

## Important Rules
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Every transaction MUST have a transaction_class
- Think: which GROUP does this belong to? Then pick the most specific category in that group.
- Use "Other" only as an absolute last resort`,
  }
}
