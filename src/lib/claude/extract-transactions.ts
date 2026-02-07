import Anthropic from '@anthropic-ai/sdk'
import { extractionSchema, reclassificationSchema, VALID_CATEGORIES, type ExtractionResult, type ReclassificationResult } from './schemas'

interface ReclassifyInput {
  id: number
  date: string
  description: string
  amount: number
  type: string
}

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
- category: classify into exactly one of: ${VALID_CATEGORIES.join(', ')}

DOCUMENT TYPE CONTEXT — this determines how to interpret debits and credits:
- Credit card: debits are purchases/charges, credits are payments to the card or refunds (NOT income). Use "Transfer" for bill payments, "Refund" for returned purchases.
- Checking/savings account: debits are money out (spending, transfers), credits are money in (salary, deposits). Use "Income" for salary/wages, "Transfer" for account transfers.
- Investment: debits are contributions/purchases, credits are withdrawals/dividends.

CATEGORY GUIDE:
- Groceries: supermarkets, food stores (Whole Foods, Trader Joe's, Kroger)
- Restaurants & Dining: restaurants, coffee shops, fast food, delivery
- Gas & Fuel: gas stations, EV charging
- Public Transit: bus, subway, rail, transit passes
- Rideshare & Taxi: Uber, Lyft, taxis
- Parking & Tolls: parking garages, meters, toll charges
- Rent & Mortgage: rent, mortgage payments
- Home Maintenance: repairs, cleaning, contractors, lawn care
- Utilities: electric, water, gas, internet, phone bills
- Subscriptions: streaming, SaaS, gym memberships, recurring charges
- Shopping: general retail, clothing, Amazon (non-electronics)
- Electronics: computers, phones, gadgets, tech accessories
- Health & Medical: doctor, pharmacy, hospital, dental, vision
- Fitness: gym, sports equipment, wellness apps
- Insurance: health, auto, home, life insurance premiums
- Childcare & Education: tuition, daycare, school supplies, courses
- Pets: veterinarian, pet food, pet supplies
- Travel: hotels, flights, car rental, vacation expenses
- Entertainment: movies, concerts, events, games, hobbies
- Gifts & Donations: charity, presents, tips
- Personal Care: haircuts, spa, cosmetics, personal hygiene
- Income: salary, freelance income, interest, dividends (bank accounts only)
- Transfer: account transfers, credit card bill payments, internal moves
- Refund: returns, reimbursements, chargebacks
- Fees & Charges: bank fees, late fees, ATM fees, service charges
- Other: anything that doesn't fit the above

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
- Choose the most specific category that fits
- Use "Other" only if none of the specific categories fit`

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

const RECLASSIFY_PROMPT = `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds (NOT income). Use "Transfer" for bill payments, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Income" for salary/wages.
- investment: credits are withdrawals/dividends.

CATEGORIES: ${VALID_CATEGORIES.join(', ')}

Return ONLY valid JSON:
{
  "classifications": [
    {"id": <transaction_id>, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`

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
