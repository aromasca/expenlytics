import type { ProviderName, PromptTemplate } from '../types'

const NORMALIZATION_PROMPTS: Record<ProviderName, PromptTemplate> = {
  anthropic: {
    user: `You are a financial transaction merchant normalizer. Given a list of transaction descriptions from bank/credit card statements, normalize each to a clean, canonical merchant name.

RULES:
- Map variations of the same merchant to ONE canonical name (e.g., "AMZN MKTP US*1A2B3C" and "Amazon.com*4D5E6F" → "Amazon")
- Strip transaction codes, reference numbers, location suffixes, and store numbers
- Use the well-known brand name when recognizable (e.g., "SQ *BLUE BOTTLE" → "Blue Bottle Coffee")
- Keep the name human-readable and title-cased
- For unrecognizable merchants, clean up the name as best you can
- Every input description MUST appear exactly once in the output

SPECIFIC RULES:
- "BA Electronic Payment" = Bank of America (NOT British Airways)
- Normalize case consistently (use title case)
- Collapse apostrophe/accent variants: "Due Cucina" = "Due' Cucina"
- Treat different financial products from the same institution as SEPARATE merchants. Mortgage payments (ACH), credit card payments (ePay/AutoPay), and loan payments from the same bank are different merchants (e.g. "JPMorgan Chase ACH" → "JPMorgan Chase Mortgage", "Chase Credit Card ePay" → "Chase Credit Card")

{existing_merchants_block}Return ONLY valid JSON:
{
  "normalizations": [
    {"description": "<original>", "merchant": "<normalized>"}
  ]
}

Descriptions to normalize:
{descriptions_json}`,
  },
  openai: {
    user: `You are a financial transaction merchant normalizer. Given a list of transaction descriptions from bank/credit card statements, normalize each to a clean, canonical merchant name.

## Rules
1. Map variations of the same merchant to ONE canonical name (e.g., "AMZN MKTP US*1A2B3C" and "Amazon.com*4D5E6F" → "Amazon")
2. Strip transaction codes, reference numbers, location suffixes, and store numbers
3. Use the well-known brand name when recognizable (e.g., "SQ *BLUE BOTTLE" → "Blue Bottle Coffee")
4. Keep the name human-readable and title-cased
5. For unrecognizable merchants, clean up the name as best you can
6. Every input description MUST appear exactly once in the output

## Specific Rules
- "BA Electronic Payment" = Bank of America (NOT British Airways)
- Normalize case consistently (use title case)
- Collapse apostrophe/accent variants: "Due Cucina" = "Due' Cucina"
- Treat different financial products from the same institution as SEPARATE merchants. Mortgage payments (ACH), credit card payments (ePay/AutoPay), and loan payments from the same bank are different merchants (e.g. "JPMorgan Chase ACH" → "JPMorgan Chase Mortgage", "Chase Credit Card ePay" → "Chase Credit Card")

{existing_merchants_block}## Output Format

Return ONLY valid JSON:
\`\`\`json
{
  "normalizations": [
    {"description": "<original>", "merchant": "<normalized>"}
  ]
}
\`\`\`

## Descriptions to Normalize
{descriptions_json}`,
  },
}

export function getNormalizationPrompt(provider: ProviderName): PromptTemplate {
  return NORMALIZATION_PROMPTS[provider]
}
