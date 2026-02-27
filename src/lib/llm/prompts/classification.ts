import type { PromptTemplate } from '../types'

const CLASSIFICATION_CORE = `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most specific and appropriate category to each.

## Document Type: {document_type}

## Document Type Context
- **credit_card**: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- **checking_account/savings_account**: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- **investment**: credits are withdrawals/dividends.

## Transfer Identification (debit side — critical for accurate totals)
- Credit card bill payments from checking → "Transfer"
- Transfers to savings/investment accounts → "Savings" or "Investments"
- P2P payments to yourself (Venmo, Zelle, PayPal self-transfers) → "Transfer"
- ACH transfers between own accounts → "Transfer"
- Wire transfers between own accounts → "Transfer"
- 401k/brokerage contributions → "Investments"
- Savings account contributions → "Savings"

## Approach

For each transaction, first identify which GROUP it belongs to, then pick the most specific category within that group.

## Categories by Group
- **Food & Drink**: Groceries, Restaurants, Coffee & Cafes, Fast Food, Food Delivery, Bars & Alcohol
- **Transportation**: Gas & Fuel, Public Transit, Rideshare & Taxi, Parking & Tolls, Car Maintenance, Car Payment, Car Insurance
- **Housing**: Rent & Mortgage, Utilities, Internet & Phone, Home Maintenance, Home Improvement, Furniture & Decor, Home Insurance
- **Shopping**: Clothing & Accessories, Electronics, Office Supplies, Home Goods, Books, Sporting Goods, General Merchandise
- **Health & Wellness**: Health Insurance, Medical & Dental, Pharmacy, Fitness & Gym, Mental Health, Vision & Eye Care
- **Entertainment**: Movies & Theater, Music & Concerts, Gaming, Streaming Services, Sports & Outdoors, Hobbies
- **Personal**: Personal Care & Beauty, Haircuts & Salon, Laundry & Dry Cleaning
- **Education**: Tuition & School Fees, Books & Supplies, Online Courses
- **Kids & Family**: Childcare, Kids Activities, Baby & Kids Supplies
- **Pets**: Pet Food & Supplies, Veterinary, Pet Services
- **Travel**: Flights, Hotels & Lodging, Rental Cars, Travel Activities, Travel Insurance
- **Financial**: Fees & Charges, Interest & Finance Charges, Taxes, Investments, Savings
- **Gifts & Giving**: Gifts, Charitable Donations
- **Income & Transfers**: Salary & Wages, Freelance Income, Refund, Transfer, ATM Withdrawal
- **Software & Services**: AI & Productivity Software, SaaS & Subscriptions
- **Other**: Other

## Key Disambiguation Rules
- Coffee shops and tea shops → Coffee & Cafes (not Restaurants)
- Food delivery apps → Food Delivery (not Restaurants)
- Media streaming subscriptions → Streaming Services
- Large online marketplaces → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

## Additional Disambiguation
- Bakeries and cafe-style eateries: "Coffee & Cafes" (cafe-style counter service)
- Counter-service/fast-casual chains (burger joints, burrito bars, salad bars): "Fast Food"
- Small recurring tech platform billing (cloud storage, media bundles): "Streaming Services" if primarily media/content, "SaaS & Subscriptions" if primarily tools/productivity
- Large one-time tech purchases (devices, hardware, big-ticket electronics): "Electronics" — even if from the same vendor that also does subscriptions
- AI tools, coding assistants, LLM services: "AI & Productivity Software"
- Web hosting, cloud infrastructure, domain registrars: "SaaS & Subscriptions"
- Indoor play centers, trampoline parks, bowling alleys: "Kids Activities"
- Museums, galleries, exhibits: "Hobbies"
- School district charges: "Tuition & School Fees"
- Vending machines: "Fast Food"
- Pet insurance: "Veterinary"
- Childcare management apps/platforms: always "Childcare"

## Resort & Vacation Venue Rules
- Purchases at resort restaurants, cafes, and shops → "Hotels & Lodging" (not "Restaurants" or "Groceries") — these are part of the lodging experience
- Holiday parks, vacation villages, and resort complexes → always "Hotels & Lodging" regardless of what was purchased on-site

## Fitness vs Sports vs Childcare
- Recurring memberships at sports facilities (tennis clubs, swimming pools, recreation centers) → "Fitness & Gym" (not "Sports & Outdoors")
- "Sports & Outdoors" is for one-off activities: event tickets, outdoor recreation, sports leagues
- Community/recreation centers with high monthly fees ($200+) → likely "Childcare" (camps, after-school programs) — not "Fitness & Gym"
- Youth programs at recreation centers → "Childcare" or "Kids Activities" based on context

## Food Venue Precision
- Ice cream shops, gelato shops, chocolate shops, candy stores → "Restaurants" (not "Coffee & Cafes")
- "Coffee & Cafes" is specifically for coffee/tea-focused establishments and bakery-cafes
- When unsure between "Restaurants" and "Fast Food": if it has table service → "Restaurants"; if counter/pickup only → "Fast Food"

- "Other" is a LAST RESORT — if ANY recognizable word exists, classify specifically`

export function getClassifyPrompt(): PromptTemplate {
  return {
    user: `${CLASSIFICATION_CORE}

{known_mappings}## Output Format

Return ONLY valid JSON:
\`\`\`json
{
  "classifications": [
    {"index": 0, "category": "<category>"}
  ]
}
\`\`\`

## Transactions to Classify
{transactions_json}`,
  }
}

export function getReclassifyPrompt(): PromptTemplate {
  return {
    user: `${CLASSIFICATION_CORE}

## Output Format

Return ONLY valid JSON:
\`\`\`json
{
  "classifications": [
    {"id": <transaction_id>, "category": "<category>"}
  ]
}
\`\`\`

## Transactions to Classify
{transactions_json}`,
  }
}
