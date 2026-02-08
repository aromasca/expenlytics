# Category Taxonomy Redesign

## Goal
Replace the 26 broad categories with a detailed 66-category taxonomy, grouped for UI navigation. Improve LLM classification prompt with disambiguation rules. Add backfill endpoint to reclassify existing transactions.

## New Taxonomy (66 categories, 15 groups)

**Food & Drink:** Groceries, Restaurants, Coffee & Cafes, Fast Food, Food Delivery, Bars & Alcohol

**Transportation:** Gas & Fuel, Public Transit, Rideshare & Taxi, Parking & Tolls, Car Maintenance, Car Payment, Car Insurance

**Housing:** Rent & Mortgage, Utilities, Internet & Phone, Home Maintenance, Home Improvement, Furniture & Decor, Home Insurance

**Shopping:** Clothing & Accessories, Electronics, Office Supplies, Home Goods, Books, Sporting Goods, General Merchandise

**Health & Wellness:** Health Insurance, Medical & Dental, Pharmacy, Fitness & Gym, Mental Health, Vision & Eye Care

**Entertainment:** Movies & Theater, Music & Concerts, Gaming, Streaming Services, Sports & Outdoors, Hobbies

**Personal:** Personal Care & Beauty, Haircuts & Salon, Laundry & Dry Cleaning

**Education:** Tuition & School Fees, Books & Supplies, Online Courses

**Kids & Family:** Childcare, Kids Activities, Baby & Kids Supplies

**Pets:** Pet Food & Supplies, Veterinary, Pet Services

**Travel:** Flights, Hotels & Lodging, Rental Cars, Travel Activities, Travel Insurance

**Financial:** Fees & Charges, Interest & Finance Charges, Taxes, Investments, Savings

**Gifts & Giving:** Gifts, Charitable Donations

**Income & Transfers:** Salary & Wages, Freelance Income, Refund, Transfer, ATM Withdrawal

**Other:** Other

## Migration Mapping (Old → New)

| Old | New |
|---|---|
| Groceries | Groceries |
| Restaurants & Dining | Restaurants |
| Gas & Fuel | Gas & Fuel |
| Public Transit | Public Transit |
| Rideshare & Taxi | Rideshare & Taxi |
| Parking & Tolls | Parking & Tolls |
| Rent & Mortgage | Rent & Mortgage |
| Home Maintenance | Home Maintenance |
| Utilities | Utilities |
| Subscriptions | Streaming Services |
| Shopping | General Merchandise |
| Electronics | Electronics |
| Health & Medical | Medical & Dental |
| Fitness | Fitness & Gym |
| Insurance | Health Insurance |
| Childcare & Education | Tuition & School Fees |
| Pets | Pet Food & Supplies |
| Travel | Travel Activities |
| Entertainment | Movies & Theater |
| Gifts & Donations | Gifts |
| Personal Care | Personal Care & Beauty |
| Income | Salary & Wages |
| Transfer | Transfer |
| Refund | Refund |
| Fees & Charges | Fees & Charges |
| Other | Other |

## Architecture

### DB Changes (schema.ts)
- New `SEED_CATEGORIES` with 66 entries, each having `name`, `color`, `group`
- Add `category_group TEXT` column to categories table
- Migration: rename old categories to new names via UPDATE, insert new ones, assign groups
- Color scheme: each group gets a base hue with variations

### LLM Prompt (extract-transactions.ts)
- Categories organized by group in the prompt
- 2-3 example merchants per category
- Disambiguation rules section
- "Think hierarchically: pick group first, then specific category"

### Backfill Endpoint
- `POST /api/reclassify/backfill` — reclassifies all `manual_category = 0` transactions
- Processes in batches of 50
- Returns progress (total, processed, updated)

### UI Changes
- `CategorySelect`: grouped dropdown with group headers
- `FilterBar`: grouped checkboxes under collapsible headers

### Files Modified
1. `src/lib/db/schema.ts`
2. `src/lib/claude/schemas.ts`
3. `src/lib/claude/extract-transactions.ts`
4. `src/components/category-select.tsx`
5. `src/components/filter-bar.tsx`
6. `src/app/api/reclassify/backfill/route.ts` (new)
7. `src/__tests__/lib/db/categories.test.ts`
8. `src/__tests__/lib/claude/extract-transactions.test.ts`

## Implementation Order
1. Schema + migration
2. LLM prompt rewrite
3. Backfill endpoint
4. UI updates
5. Tests
