import type { ProviderName, PromptTemplate } from '../types'

const CLASSIFY_PROMPTS: Record<ProviderName, PromptTemplate> = {
  anthropic: {
    user: `You are a financial transaction categorizer. Given the document type and a list of transactions (identified by index), assign the most specific and appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- investment: credits are withdrawals/dividends.

TRANSFER IDENTIFICATION (debit side — critical for accurate totals):
- Credit card bill payments from checking → "Transfer"
- Transfers to savings/investment accounts → "Savings" or "Investments"
- P2P payments to yourself (Venmo, Zelle, PayPal self-transfers) → "Transfer"
- ACH transfers between own accounts → "Transfer"
- Wire transfers between own accounts → "Transfer"
- 401k/brokerage contributions → "Investments"
- Savings account contributions → "Savings"

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

ADDITIONAL DISAMBIGUATION:
- Bakeries (Paris Baguette, Panera): "Coffee & Cafes" (cafe-style service)
- Shake Shack, Five Guys, Chipotle, Sweetgreen: "Fast Food" (counter service)
- Apple.com/Bill recurring charges: "SaaS & Subscriptions" (iCloud, Apple services)
- One-time Apple purchases (apple.com/us, large amounts): "Electronics"
- OpenAI, ChatGPT, Claude, Copilot: "AI & Productivity Software"
- Hosting (Bluehost, DreamHost, DigitalOcean): "SaaS & Subscriptions"
- Indoor play (Urban Air, trampoline parks, bowling): "Kids Activities"
- Museums, galleries, exhibits: "Hobbies"
- School district charges: "Tuition & School Fees"
- Vending machines: "Fast Food"
- Pet insurance (Healthy Paws, Trupanion): "Veterinary"
- Childcare apps (Brightwheel): always "Childcare"
- "Other" is a LAST RESORT — if ANY recognizable word exists, classify specifically

{known_mappings}Return ONLY valid JSON:
{
  "classifications": [
    {"index": 0, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`,
  },
  openai: {
    user: `You are a financial transaction categorizer. Given the document type and a list of transactions (identified by index), assign the most specific and appropriate category to each.

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
- Starbucks/Dunkin → Coffee & Cafes (not Restaurants)
- DoorDash/Uber Eats → Food Delivery (not Restaurants)
- Netflix/Spotify/Disney+ → Streaming Services
- Amazon → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

## Additional Disambiguation
- Bakeries (Paris Baguette, Panera): "Coffee & Cafes" (cafe-style service)
- Shake Shack, Five Guys, Chipotle, Sweetgreen: "Fast Food" (counter service)
- Apple.com/Bill recurring charges: "SaaS & Subscriptions" (iCloud, Apple services)
- One-time Apple purchases (apple.com/us, large amounts): "Electronics"
- OpenAI, ChatGPT, Claude, Copilot: "AI & Productivity Software"
- Hosting (Bluehost, DreamHost, DigitalOcean): "SaaS & Subscriptions"
- Indoor play (Urban Air, trampoline parks, bowling): "Kids Activities"
- Museums, galleries, exhibits: "Hobbies"
- School district charges: "Tuition & School Fees"
- Vending machines: "Fast Food"
- Pet insurance (Healthy Paws, Trupanion): "Veterinary"
- Childcare apps (Brightwheel): always "Childcare"
- "Other" is a LAST RESORT — if ANY recognizable word exists, classify specifically

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
  },
}

const RECLASSIFY_PROMPTS: Record<ProviderName, PromptTemplate> = {
  anthropic: {
    user: `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most specific and appropriate category to each.

DOCUMENT TYPE: {document_type}

DOCUMENT TYPE CONTEXT:
- credit_card: credits are payments to the card or refunds. NEVER use "Salary & Wages" or "Freelance Income" — use "Transfer" for payments/transfers, "Refund" for returned purchases.
- checking_account/savings_account: credits are money in (salary, deposits). Use "Salary & Wages" for salary/wages.
- investment: credits are withdrawals/dividends.

TRANSFER IDENTIFICATION (debit side — critical for accurate totals):
- Credit card bill payments from checking → "Transfer"
- Transfers to savings/investment accounts → "Savings" or "Investments"
- P2P payments to yourself (Venmo, Zelle, PayPal self-transfers) → "Transfer"
- ACH transfers between own accounts → "Transfer"
- Wire transfers between own accounts → "Transfer"
- 401k/brokerage contributions → "Investments"
- Savings account contributions → "Savings"

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

ADDITIONAL DISAMBIGUATION:
- Bakeries (Paris Baguette, Panera): "Coffee & Cafes" (cafe-style service)
- Shake Shack, Five Guys, Chipotle, Sweetgreen: "Fast Food" (counter service)
- Apple.com/Bill recurring charges: "SaaS & Subscriptions" (iCloud, Apple services)
- One-time Apple purchases (apple.com/us, large amounts): "Electronics"
- OpenAI, ChatGPT, Claude, Copilot: "AI & Productivity Software"
- Hosting (Bluehost, DreamHost, DigitalOcean): "SaaS & Subscriptions"
- Indoor play (Urban Air, trampoline parks, bowling): "Kids Activities"
- Museums, galleries, exhibits: "Hobbies"
- School district charges: "Tuition & School Fees"
- Vending machines: "Fast Food"
- Pet insurance (Healthy Paws, Trupanion): "Veterinary"
- Childcare apps (Brightwheel): always "Childcare"
- "Other" is a LAST RESORT — if ANY recognizable word exists, classify specifically

Return ONLY valid JSON:
{
  "classifications": [
    {"id": <transaction_id>, "category": "<category>"}
  ]
}

Transactions to classify:
{transactions_json}`,
  },
  openai: {
    user: `You are a financial transaction categorizer. Given the document type and a list of transactions, assign the most specific and appropriate category to each.

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
- Starbucks/Dunkin → Coffee & Cafes (not Restaurants)
- DoorDash/Uber Eats → Food Delivery (not Restaurants)
- Netflix/Spotify/Disney+ → Streaming Services
- Amazon → General Merchandise (unless description indicates Books, Electronics, Groceries)
- Internet/cable/phone → Internet & Phone (not Utilities)
- Auto insurance → Car Insurance | Home insurance → Home Insurance | Health insurance → Health Insurance

## Additional Disambiguation
- Bakeries (Paris Baguette, Panera): "Coffee & Cafes" (cafe-style service)
- Shake Shack, Five Guys, Chipotle, Sweetgreen: "Fast Food" (counter service)
- Apple.com/Bill recurring charges: "SaaS & Subscriptions" (iCloud, Apple services)
- One-time Apple purchases (apple.com/us, large amounts): "Electronics"
- OpenAI, ChatGPT, Claude, Copilot: "AI & Productivity Software"
- Hosting (Bluehost, DreamHost, DigitalOcean): "SaaS & Subscriptions"
- Indoor play (Urban Air, trampoline parks, bowling): "Kids Activities"
- Museums, galleries, exhibits: "Hobbies"
- School district charges: "Tuition & School Fees"
- Vending machines: "Fast Food"
- Pet insurance (Healthy Paws, Trupanion): "Veterinary"
- Childcare apps (Brightwheel): always "Childcare"
- "Other" is a LAST RESORT — if ANY recognizable word exists, classify specifically

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
  },
}

export function getClassifyPrompt(provider: ProviderName): PromptTemplate {
  return CLASSIFY_PROMPTS[provider]
}

export function getReclassifyPrompt(provider: ProviderName): PromptTemplate {
  return RECLASSIFY_PROMPTS[provider]
}
