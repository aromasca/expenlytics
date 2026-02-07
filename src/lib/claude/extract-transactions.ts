import Anthropic from '@anthropic-ai/sdk'
import { extractionSchema, VALID_CATEGORIES, type ExtractionResult } from './schemas'

const EXTRACTION_PROMPT = `You are a precise financial document parser. Extract ALL transactions from this bank statement PDF and categorize each one.

For each transaction, extract:
- date: in YYYY-MM-DD format
- description: merchant name or transaction description (clean up any extra codes/numbers, make it human-readable)
- amount: as a positive number (no currency symbols)
- type: "debit" for money going out (purchases, payments, withdrawals), "credit" for money coming in (deposits, refunds, salary)
- category: classify into exactly one of these categories: ${VALID_CATEGORIES.join(', ')}

Return ONLY valid JSON in this exact format:
{
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "...", "amount": 0.00, "type": "debit|credit", "category": "..."}
  ]
}

Important:
- Include every transaction, do not skip any
- Dates must be YYYY-MM-DD format
- Amounts must be positive numbers
- Distinguish debits (money out) from credits (money in) carefully
- Choose the most appropriate category for each transaction based on the merchant/description
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
