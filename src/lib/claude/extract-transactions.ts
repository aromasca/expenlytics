import Anthropic from '@anthropic-ai/sdk'
import { extractionSchema, reclassificationSchema, rawExtractionSchema, classificationSchema, VALID_CATEGORIES, type ExtractionResult, type ReclassificationResult, type RawExtractionResult, type ClassificationResult, type RawTransactionData } from './schemas'

interface ReclassifyInput {
  id: number
  date: string
  description: string
  amount: number
  type: string
}

const RAW_EXTRACTION_PROMPT = `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions.

STEP 1: Identify the document type:
- "credit_card" — credit card statement
- "checking_account" — checking/current account statement
- "savings_account" — savings account statement
- "investment" — investment/brokerage statement
- "other" — any other financial document

STEP 2: Extract every transaction. For each:
- date: in YYYY-MM-DD format
- description: merchant name or transaction description (clean up codes/numbers, make human-readable)
- amount: as a positive number (no currency symbols)
- type: "debit" or "credit" based on DOCUMENT TYPE CONTEXT (see below)

DOCUMENT TYPE CONTEXT — this determines how to interpret debits and credits:
- Credit card: debits are purchases/charges, credits are payments to the card or refunds.
- Checking/savings account: debits are money out (spending, transfers), credits are money in (salary, deposits).
- Investment: debits are contributions/purchases, credits are withdrawals/dividends.

Return ONLY valid JSON in this exact format:
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit"}
  ]
}

Important:
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Do NOT assign categories — only extract raw transaction data`

const EXTRACTION_PROMPT = `You are a precise financial document parser. First, identify the type of financial document, then extract ALL transactions with context-aware categorization.

STEP 1: Identify the document type:
- "credit_card" — credit card statement
- "checking_account" — checking/current account statement
- "savings_account" — savings account statement
- "investment" — investment/brokerage statement
- "other" — any other financial document

STEP 2: Extract every transaction. For each:
- date: in YYYY-MM-DD format
- description: merchant name or transaction description (clean up codes/numbers, make human-readable)
- amount: as a positive number (no currency symbols)
- type: "debit" or "credit" based on DOCUMENT TYPE CONTEXT (see below)
- category: classify into exactly one of the categories listed below

DOCUMENT TYPE CONTEXT — this determines how to interpret debits and credits:
- Credit card: debits are purchases/charges, credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" for credit card credits — use "Transfer" for payments/transfers to the card, "Refund" for returned purchases.
- Checking/savings account: debits are money out (spending, transfers), credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- Investment: debits are contributions/purchases, credits are withdrawals/dividends.

CLASSIFICATION APPROACH: Think in two steps — first identify which GROUP the transaction belongs to, then pick the most specific category within that group.

CATEGORY GUIDE (organized by group):

[Food & Drink]
- Groceries: supermarkets, food stores (Whole Foods, Trader Joe's, Kroger, Safeway, Costco food)
- Restaurants: sit-down restaurants, diners (Olive Garden, Cheesecake Factory, local restaurants)
- Coffee & Cafes: coffee shops, tea shops (Starbucks, Dunkin', Peet's, local cafes)
- Fast Food: quick service, drive-through (McDonald's, Chick-fil-A, Taco Bell, Wendy's)
- Food Delivery: delivery apps and services (DoorDash, Uber Eats, Grubhub, Instacart)
- Bars & Alcohol: bars, breweries, liquor stores, wine shops

[Transportation]
- Gas & Fuel: gas stations, EV charging (Shell, Chevron, BP, ChargePoint)
- Public Transit: bus, subway, rail, transit passes (MTA, BART, metro cards)
- Rideshare & Taxi: ride services (Uber, Lyft, taxis)
- Parking & Tolls: parking garages, meters, toll charges, E-ZPass
- Car Maintenance: oil changes, repairs, tires, car wash, inspections
- Car Payment: auto loan payments, car lease payments
- Car Insurance: auto insurance premiums (GEICO, State Farm, Progressive)

[Housing]
- Rent & Mortgage: rent payments, mortgage payments, HOA fees
- Utilities: electric, water, gas, sewer, trash (PG&E, ConEd, water bills)
- Internet & Phone: internet, cable TV, cell phone bills (Comcast, Verizon, AT&T, T-Mobile)
- Home Maintenance: repairs, cleaning, contractors, plumbers, electricians, lawn care
- Home Improvement: renovations, hardware stores (Home Depot, Lowe's), paint, tools
- Furniture & Decor: furniture, home decor, rugs, curtains (IKEA, Pottery Barn, Wayfair)
- Home Insurance: homeowner's/renter's insurance

[Shopping]
- Clothing & Accessories: apparel, shoes, jewelry, handbags (Zara, Nike, H&M, Nordstrom)
- Electronics: computers, phones, gadgets, tech accessories (Apple, Best Buy, B&H)
- Office Supplies: office and stationery items (Staples, Office Depot, printer ink)
- Home Goods: kitchenware, bedding, bath items (Target home, Bed Bath, Crate & Barrel)
- Books: bookstores, e-books (Barnes & Noble, Kindle, Audible)
- Sporting Goods: sports equipment, outdoor gear (REI, Dick's, Bass Pro)
- General Merchandise: Amazon (non-specific), Walmart, Target (general), dollar stores

[Health & Wellness]
- Health Insurance: health/medical insurance premiums
- Medical & Dental: doctor visits, hospital, dental, urgent care, lab work
- Pharmacy: prescriptions, drugstores (CVS, Walgreens, Rite Aid)
- Fitness & Gym: gym memberships, fitness classes, sports equipment (Planet Fitness, CrossFit, Peloton)
- Mental Health: therapy, counseling, psychiatry, meditation apps (BetterHelp, Calm, Headspace)
- Vision & Eye Care: eye exams, glasses, contacts, optometrist

[Entertainment]
- Movies & Theater: movie tickets, theaters, plays (AMC, Regal, Broadway)
- Music & Concerts: concert tickets, live music venues, music purchases
- Gaming: video games, gaming subscriptions, game consoles (Steam, Xbox, PlayStation, Nintendo)
- Streaming Services: streaming subscriptions (Netflix, Spotify, Disney+, HBO Max, YouTube Premium)
- Sports & Outdoors: sports events, tickets, leagues, outdoor recreation
- Hobbies: craft supplies, hobby materials, collectibles, art supplies

[Personal]
- Personal Care & Beauty: cosmetics, skincare, personal hygiene (Sephora, Ulta, bath products)
- Haircuts & Salon: haircuts, coloring, barber shops, nail salons, spa services
- Laundry & Dry Cleaning: laundromat, dry cleaners, wash & fold services

[Education]
- Tuition & School Fees: tuition, school fees, college expenses
- Books & Supplies: textbooks, school supplies, educational materials
- Online Courses: online learning platforms (Coursera, Udemy, Skillshare, MasterClass)

[Kids & Family]
- Childcare: daycare, nannies, babysitters, after-school programs
- Kids Activities: children's classes, camps, sports leagues, birthday parties
- Baby & Kids Supplies: diapers, baby gear, children's clothing, toys

[Pets]
- Pet Food & Supplies: pet food, treats, toys, accessories (Chewy, PetSmart, Petco)
- Veterinary: vet visits, pet medications, pet health
- Pet Services: grooming, boarding, pet sitting, dog walking (Rover, Wag)

[Travel]
- Flights: airline tickets, baggage fees (United, Delta, Southwest, JetBlue)
- Hotels & Lodging: hotels, Airbnb, motels, resorts, hostels
- Rental Cars: car rentals (Hertz, Enterprise, Turo)
- Travel Activities: tours, excursions, attractions, museums while traveling
- Travel Insurance: trip insurance, travel protection plans

[Financial]
- Fees & Charges: bank fees, late fees, service charges, overdraft fees
- Interest & Finance Charges: credit card interest, loan interest, finance charges
- Taxes: tax payments, tax preparation services (TurboTax, H&R Block)
- Investments: brokerage contributions, stock purchases, retirement contributions
- Savings: savings account transfers, emergency fund contributions

[Gifts & Giving]
- Gifts: presents, gift cards purchased for others, flowers (1-800-Flowers)
- Charitable Donations: charity, nonprofits, religious organizations, GoFundMe, tips

[Income & Transfers]
- Salary & Wages: payroll, salary deposits (ONLY for checking/savings — NEVER for credit card)
- Freelance Income: 1099 income, contract work, side gig payments
- Refund: returns, reimbursements, chargebacks, merchant credits
- Transfer: account transfers, credit card bill payments, Venmo/Zelle/PayPal transfers
- ATM Withdrawal: ATM cash withdrawals

[Other]
- Other: anything that truly doesn't fit above — use sparingly

DISAMBIGUATION RULES:
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
- Home/renter's insurance: "Home Insurance" (NOT Health Insurance)

Return ONLY valid JSON in this exact format:
{
  "document_type": "credit_card|checking_account|savings_account|investment|other",
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit", "category": "..."}
  ]
}

Important:
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Apply document-type-specific debit/credit logic
- Think: which GROUP does this belong to? Then pick the most specific category in that group.
- Use "Other" only as an absolute last resort`

export async function extractRawTransactions(pdfBuffer: Buffer): Promise<RawExtractionResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: RAW_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return rawExtractionSchema.parse(parsed)
}

export async function extractTransactions(pdfBuffer: Buffer): Promise<ExtractionResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return extractionSchema.parse(parsed)
}

const RECLASSIFY_PROMPT = `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most specific and appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- investment: credits are withdrawals/dividends.

APPROACH: For each transaction, first identify which GROUP it belongs to, then pick the most specific category within that group.

CATEGORIES BY GROUP:
- Food & Drink: Groceries, Restaurants, Coffee & Cafes, Fast Food, Food Delivery, Bars & Alcohol
- Transportation: Gas & Fuel, Public Transit, Rideshare & Taxi, Parking & Tolls, Car Maintenance, Car Payment, Car Insurance
- Housing: Rent & Mortgage, Utilities, Internet & Phone, Home Maintenance, Home Improvement, Furniture & Decor, Home Insurance
- Shopping: Clothing & Accessories, Electronics, Office Supplies, Home Goods, Books, Sporting Goods, General Merchandise
- Health & Wellness: Health Insurance, Medical & Dental, Pharmacy, Fitness & Gym, Mental Health, Vision & Eye Care
- Entertainment: Movies & Theater, Music & Concerts, Gaming, Streaming Services, Sports & Outdoors, Hobbies
- Personal: Personal Care & Beauty, Haircuts & Salon, Laundry & Dry Cleaning
- Education: Tuition & School Fees, Books & Supplies, Online Courses
- Kids & Family: Childcare, Kids Activities, Baby & Kids Supplies
- Pets: Pet Food & Supplies, Veterinary, Pet Services
- Travel: Flights, Hotels & Lodging, Rental Cars, Travel Activities, Travel Insurance
- Financial: Fees & Charges, Interest & Finance Charges, Taxes, Investments, Savings
- Gifts & Giving: Gifts, Charitable Donations
- Income & Transfers: Salary & Wages, Freelance Income, Refund, Transfer, ATM Withdrawal
- Other: Other

KEY DISAMBIGUATION:
- Starbucks/Dunkin → Coffee & Cafes (not Restaurants)
- DoorDash/Uber Eats → Food Delivery (not Restaurants)
- Netflix/Spotify/Disney+ → Streaming Services
- Amazon → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

Return ONLY valid JSON:
{
  "classifications": [
    {"id": <transaction_id>, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`

const CLASSIFY_PROMPT = `You are a financial transaction categorizer. Given the document type and a list of transactions (identified by index), assign the most specific and appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- investment: credits are withdrawals/dividends.

APPROACH: For each transaction, first identify which GROUP it belongs to, then pick the most specific category within that group.

CATEGORIES BY GROUP:
- Food & Drink: Groceries, Restaurants, Coffee & Cafes, Fast Food, Food Delivery, Bars & Alcohol
- Transportation: Gas & Fuel, Public Transit, Rideshare & Taxi, Parking & Tolls, Car Maintenance, Car Payment, Car Insurance
- Housing: Rent & Mortgage, Utilities, Internet & Phone, Home Maintenance, Home Improvement, Furniture & Decor, Home Insurance
- Shopping: Clothing & Accessories, Electronics, Office Supplies, Home Goods, Books, Sporting Goods, General Merchandise
- Health & Wellness: Health Insurance, Medical & Dental, Pharmacy, Fitness & Gym, Mental Health, Vision & Eye Care
- Entertainment: Movies & Theater, Music & Concerts, Gaming, Streaming Services, Sports & Outdoors, Hobbies
- Personal: Personal Care & Beauty, Haircuts & Salon, Laundry & Dry Cleaning
- Education: Tuition & School Fees, Books & Supplies, Online Courses
- Kids & Family: Childcare, Kids Activities, Baby & Kids Supplies
- Pets: Pet Food & Supplies, Veterinary, Pet Services
- Travel: Flights, Hotels & Lodging, Rental Cars, Travel Activities, Travel Insurance
- Financial: Fees & Charges, Interest & Finance Charges, Taxes, Investments, Savings
- Gifts & Giving: Gifts, Charitable Donations
- Income & Transfers: Salary & Wages, Freelance Income, Refund, Transfer, ATM Withdrawal
- Software & Services: AI & Productivity Software, SaaS & Subscriptions
- Other: Other

KEY DISAMBIGUATION:
- Starbucks/Dunkin → Coffee & Cafes (not Restaurants)
- DoorDash/Uber Eats → Food Delivery (not Restaurants)
- Netflix/Spotify/Disney+ → Streaming Services
- Amazon → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

Return ONLY valid JSON:
{
  "classifications": [
    {"index": 0, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`

export async function classifyTransactions(
  documentType: string,
  transactions: RawTransactionData[]
): Promise<ClassificationResult> {
  const client = new Anthropic()

  const indexed = transactions.map((t, i) => ({ index: i, ...t }))
  const prompt = CLASSIFY_PROMPT
    .replace('{document_type}', documentType)
    .replace('{transactions_json}', JSON.stringify(indexed, null, 2))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return classificationSchema.parse(parsed)
}

export async function reclassifyTransactions(
  documentType: string,
  transactions: ReclassifyInput[]
): Promise<ReclassificationResult> {
  const client = new Anthropic()

  const prompt = RECLASSIFY_PROMPT
    .replace('{document_type}', documentType)
    .replace('{transactions_json}', JSON.stringify(transactions, null, 2))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return reclassificationSchema.parse(parsed)
}
