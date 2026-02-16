import { PDFParse } from 'pdf-parse'
import type { LLMProvider, ProviderName } from './types'
import { getRawExtractionPrompt, getTextExtractionPrompt, getLegacyExtractionPrompt } from './prompts/extraction'
import { getClassifyPrompt, getReclassifyPrompt } from './prompts/classification'
import { extractionSchema, reclassificationSchema, rawExtractionSchema, classificationSchema, type ExtractionResult, type ReclassificationResult, type RawExtractionResult, type ClassificationResult, type RawTransactionData } from './schemas'

interface ReclassifyInput {
  id: number
  date: string
  description: string
  amount: number
  type: string
}

function extractJSON(text: string): string {
  // Handle markdown code blocks (including truncated responses without closing fence)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    return jsonMatch[1]
  }
  // Try to extract from an unclosed code fence (response may have been truncated)
  const openFence = text.match(/```(?:json)?\s*([\s\S]*)/)
  if (openFence) {
    return openFence[1]
  }
  return text
}

export async function extractRawTransactions(
  provider: LLMProvider,
  providerName: ProviderName,
  pdfBuffer: Buffer,
  model: string
): Promise<RawExtractionResult> {
  // Stage 1: Try local text extraction with pdf-parse
  let extractedText: string | null = null
  try {
    const t0 = Date.now()
    const pdf = new PDFParse({ data: pdfBuffer })
    const parsed = await pdf.getText()
    if (parsed.text && parsed.text.trim().length > 0) {
      extractedText = parsed.text
      console.log(`[extraction] pdf-parse extracted ${extractedText.length} chars in ${Date.now() - t0}ms`)
    } else {
      console.log(`[extraction] pdf-parse returned no text (scanned PDF?) — will use document upload`)
    }
    await pdf.destroy()
  } catch {
    console.warn('[extraction] pdf-parse failed, falling back to document extraction')
  }

  // Stage 2: If we have text, send to LLM via complete() (fast text-based, no document upload)
  if (extractedText) {
    try {
      const prompt = getTextExtractionPrompt(providerName)
      const filledPrompt = prompt.user.replace('{extracted_text}', extractedText)

      console.log(`[extraction] using fast text path → ${providerName} complete()`)
      const t1 = Date.now()
      const response = await provider.complete({
        system: prompt.system,
        messages: [{ role: 'user', content: filledPrompt }],
        maxTokens: 16384,
        model,
      })

      const text = response.text
      const jsonStr = extractJSON(text)
      const parsed = JSON.parse(jsonStr.trim())
      const result = rawExtractionSchema.parse(parsed)

      if (result.transactions.length > 0) {
        console.log(`[extraction] fast text path succeeded — ${result.transactions.length} transactions (${((Date.now() - t1) / 1000).toFixed(1)}s)`)
        return result
      }

      console.warn('[extraction] text-based extraction returned 0 transactions, falling back to document upload')
    } catch (err) {
      console.warn('[extraction] text-based extraction failed, falling back to document upload', err)
    }
  }

  // Stage 3: Fallback — full document upload (current behavior)
  console.log(`[extraction] using document upload path → ${providerName} extractFromDocument()`)
  const prompt = getRawExtractionPrompt(providerName)

  const response = await provider.extractFromDocument({
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxTokens: 16384,
    model,
    document: pdfBuffer,
    documentMediaType: 'application/pdf',
  })

  const text = response.text
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr.trim())
  return rawExtractionSchema.parse(parsed)
}

export async function extractTransactions(
  provider: LLMProvider,
  providerName: ProviderName,
  pdfBuffer: Buffer,
  model: string
): Promise<ExtractionResult> {
  const prompt = getLegacyExtractionPrompt(providerName)

  const response = await provider.extractFromDocument({
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    maxTokens: 16384,
    model,
    document: pdfBuffer,
    documentMediaType: 'application/pdf',
  })

  const text = response.text
  const jsonStr = extractJSON(text)
  const parsed = JSON.parse(jsonStr.trim())
  return extractionSchema.parse(parsed)
}

export async function classifyTransactions(
  provider: LLMProvider,
  providerName: ProviderName,
  documentType: string,
  transactions: RawTransactionData[],
  model: string,
  knownMappings?: Array<{ merchant: string; category: string }>
): Promise<ClassificationResult> {
  const indexed = transactions.map((t, i) => ({ index: i, ...t }))
  let knownMappingsBlock = ''
  if (knownMappings && knownMappings.length > 0) {
    const lines = knownMappings.slice(0, 50).map(m => `- ${m.merchant} → ${m.category}`)
    knownMappingsBlock = `KNOWN MERCHANT CLASSIFICATIONS (use these for consistency with previously classified transactions):\n${lines.join('\n')}\nWhen you encounter similar merchants, use the established category. Only classify independently for genuinely new merchants.\n\n`
  }

  const prompt = getClassifyPrompt(providerName)
  const filledPrompt = prompt.user
    .replace('{document_type}', documentType)
    .replace('{known_mappings}', knownMappingsBlock)
    .replace('{transactions_json}', JSON.stringify(indexed, null, 2))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const text = response.text
  if (!text.trim()) throw new Error(`Empty response from ${providerName}/${model} during classification`)
  const jsonStr = extractJSON(text)

  const parsed = JSON.parse(jsonStr.trim())
  return classificationSchema.parse(parsed)
}

export async function reclassifyTransactions(
  provider: LLMProvider,
  providerName: ProviderName,
  documentType: string,
  transactions: ReclassifyInput[],
  model: string
): Promise<ReclassificationResult> {
  const prompt = getReclassifyPrompt(providerName)
  const filledPrompt = prompt.user
    .replace('{document_type}', documentType)
    .replace('{transactions_json}', JSON.stringify(transactions, null, 2))

  const response = await provider.complete({
    system: prompt.system,
    messages: [{ role: 'user', content: filledPrompt }],
    maxTokens: 8192,
    model,
  })

  const text = response.text
  if (!text.trim()) throw new Error(`Empty response from ${providerName}/${model} during reclassification`)
  const jsonStr = extractJSON(text)

  const parsed = JSON.parse(jsonStr.trim())
  return reclassificationSchema.parse(parsed)
}
