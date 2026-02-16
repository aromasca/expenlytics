# Local PDF Text Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Speed up PDF extraction by using local text extraction (pdf-parse) before sending to LLM, falling back to full document upload for scanned PDFs.

**Architecture:** `pdf-parse` extracts raw text locally (milliseconds). That text goes to the LLM via `complete()` (text prompt, no document upload) for structuring into `RawExtractionResult`. If 0 transactions result, fall back to current `extractFromDocument()` with the PDF buffer.

**Tech Stack:** pdf-parse v2.x (pure TS, zero native deps), existing LLM provider abstraction

---

### Task 1: Install pdf-parse

**Step 1: Install the dependency**

Run: `npm install pdf-parse`

**Step 2: Verify installation**

Run: `npm ls pdf-parse`
Expected: `pdf-parse@2.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse for local PDF text extraction"
```

---

### Task 2: Add text-based extraction prompts

**Files:**
- Modify: `src/lib/llm/prompts/extraction.ts`

The existing `RAW_EXTRACTION_PROMPTS` are designed for when the LLM receives a PDF document. We need a new `TEXT_EXTRACTION_PROMPTS` for when we send extracted raw text inline.

**Step 1: Write the failing test**

Create: `src/__tests__/lib/llm/prompts/extraction.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { getRawExtractionPrompt, getTextExtractionPrompt } from '@/lib/llm/prompts/extraction'

describe('getTextExtractionPrompt', () => {
  it('returns prompt with placeholder for extracted text for anthropic', () => {
    const prompt = getTextExtractionPrompt('anthropic')
    expect(prompt.user).toContain('{extracted_text}')
    expect(prompt.user).toContain('financial statement')
    expect(prompt.user).toContain('YYYY-MM-DD')
    expect(prompt.user).toContain('transaction_class')
  })

  it('returns prompt with placeholder for extracted text for openai', () => {
    const prompt = getTextExtractionPrompt('openai')
    expect(prompt.user).toContain('{extracted_text}')
    expect(prompt.user).toContain('financial statement')
  })

  it('text prompt does NOT mention PDF or document upload', () => {
    const anthropic = getTextExtractionPrompt('anthropic')
    const openai = getTextExtractionPrompt('openai')
    // Should not reference analyzing a "document" since we're giving it raw text
    expect(anthropic.user).not.toContain('document parser')
    expect(openai.user).not.toContain('document parser')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/lib/llm/prompts/extraction.test.ts`
Expected: FAIL — `getTextExtractionPrompt` is not exported

**Step 3: Write the implementation**

Add to `src/lib/llm/prompts/extraction.ts` — a new `TEXT_EXTRACTION_PROMPTS` record and `getTextExtractionPrompt` export. The prompt should:
- Frame itself as "parse the following financial statement text" (not "analyze this document")
- Include the `{extracted_text}` placeholder for the caller to fill
- Include all the same extraction rules (date format, amount, type, transaction_class, foreign currency, etc.) from the existing raw extraction prompt
- Use XML tags for Anthropic variant, markdown headers for OpenAI variant
- Mention it covers bank statements, credit card statements, and other financial documents

Template for Anthropic variant:
```
You are a precise financial statement text parser. You will receive raw text extracted from a financial statement (bank statement, credit card statement, savings account statement, or investment statement). Parse the text and extract ALL transactions.

STEP 1: Identify the document type:
[same as existing RAW_EXTRACTION_PROMPTS.anthropic]

STEP 2: Extract every transaction from the text below.
[same field definitions and rules as existing RAW_EXTRACTION_PROMPTS.anthropic]

<extracted_text>
{extracted_text}
</extracted_text>

Return ONLY valid JSON...
[same JSON format as existing]
```

Template for OpenAI variant:
```
You are a precise financial statement text parser. You will receive raw text extracted from a financial statement (bank statement, credit card statement, savings account statement, or investment statement). Parse the text and extract ALL transactions.

## Step 1: Identify Document Type
[same as existing RAW_EXTRACTION_PROMPTS.openai]

## Step 2: Extract Every Transaction
[same field definitions and rules]

## Extracted Text

{extracted_text}

## Output Format
[same JSON format]
```

Export the new function:
```typescript
export function getTextExtractionPrompt(provider: ProviderName): PromptTemplate {
  return TEXT_EXTRACTION_PROMPTS[provider]
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/lib/llm/prompts/extraction.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/prompts/extraction.ts" "src/__tests__/lib/llm/prompts/extraction.test.ts"
git commit -m "feat: add text-based extraction prompts for local PDF parsing"
```

---

### Task 3: Add local text extraction + fallback to extractRawTransactions

**Files:**
- Modify: `src/lib/llm/extract-transactions.ts`
- Modify: `src/__tests__/lib/llm/extract-transactions.test.ts`

This is the core change. `extractRawTransactions` gains a two-stage flow:
1. `pdf-parse(buffer)` → raw text (local, fast)
2. `provider.complete()` with text prompt → structured result
3. If 0 transactions → `provider.extractFromDocument()` with PDF buffer (current behavior)

**Step 1: Write the failing tests**

Add to `src/__tests__/lib/llm/extract-transactions.test.ts`:

```typescript
// At top of file, add mock for pdf-parse
import { vi } from 'vitest'

const mockPdfParse = vi.fn()
vi.mock('pdf-parse', () => ({
  default: mockPdfParse,
}))
```

Then add these test cases inside the `extractRawTransactions` describe block:

```typescript
  it('uses local text extraction when pdf-parse returns text and LLM structures it', async () => {
    const extractedText = '01/15/2025 WHOLE FOODS $85.50\n01/16/2025 SALARY DEPOSIT $3,000.00'
    mockPdfParse.mockResolvedValue({ text: extractedText, numpages: 1 })

    const responseJSON = JSON.stringify({
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', transaction_class: 'purchase' },
        { date: '2025-01-16', description: 'Salary Deposit', amount: 3000, type: 'credit', transaction_class: 'purchase' },
      ],
    })
    const { provider, mockComplete, mockExtract } = createMockProvider(responseJSON)

    const result = await extractRawTransactions(provider, 'anthropic', Buffer.from('fake pdf'), 'test-model')

    expect(result.transactions).toHaveLength(2)
    // Should use complete() (text prompt), NOT extractFromDocument()
    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(mockExtract).not.toHaveBeenCalled()
    // The prompt should contain the extracted text
    const prompt = mockComplete.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain(extractedText)
  })

  it('falls back to document extraction when text-based extraction returns 0 transactions', async () => {
    const extractedText = 'some garbled text that does not contain transactions'
    mockPdfParse.mockResolvedValue({ text: extractedText, numpages: 1 })

    // First call (complete with text) returns 0 transactions
    const emptyResponse = JSON.stringify({ document_type: 'other', transactions: [] })
    // Second call (extractFromDocument with PDF) returns real transactions
    const fullResponse = JSON.stringify({
      document_type: 'credit_card',
      transactions: [
        { date: '2025-01-15', description: 'Target', amount: 42.99, type: 'debit', transaction_class: 'purchase' },
      ],
    })

    const mockComplete = vi.fn().mockResolvedValue({ text: emptyResponse })
    const mockExtract = vi.fn().mockResolvedValue({ text: fullResponse })
    const provider = { complete: mockComplete, extractFromDocument: mockExtract } as LLMProvider

    const fakePdf = Buffer.from('fake pdf')
    const result = await extractRawTransactions(provider, 'anthropic', fakePdf, 'test-model')

    expect(result.transactions).toHaveLength(1)
    expect(result.document_type).toBe('credit_card')
    // Should have tried text first, then fallen back
    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(mockExtract.mock.calls[0][0].document).toBe(fakePdf)
  })

  it('falls back to document extraction when pdf-parse throws', async () => {
    mockPdfParse.mockRejectedValue(new Error('Invalid PDF'))

    const responseJSON = JSON.stringify({
      document_type: 'checking_account',
      transactions: [
        { date: '2025-01-15', description: 'Whole Foods', amount: 85.50, type: 'debit', transaction_class: 'purchase' },
      ],
    })
    const { provider, mockComplete, mockExtract } = createMockProvider(responseJSON)

    const result = await extractRawTransactions(provider, 'anthropic', Buffer.from('fake pdf'), 'test-model')

    expect(result.transactions).toHaveLength(1)
    // pdf-parse failed, so should fall back to extractFromDocument
    expect(mockComplete).not.toHaveBeenCalled()
    expect(mockExtract).toHaveBeenCalledTimes(1)
  })
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/lib/llm/extract-transactions.test.ts`
Expected: FAIL — existing test may also break since mock changes global behavior. We'll fix all of them.

**Step 3: Implement the two-stage extraction**

Update the existing test setup: ensure `mockPdfParse` returns text by default for the existing tests too (they should still pass via the text path or by mocking accordingly).

Modify `extractRawTransactions` in `src/lib/llm/extract-transactions.ts`:

```typescript
import pdfParse from 'pdf-parse'
import { getTextExtractionPrompt } from './prompts/extraction'

export async function extractRawTransactions(
  provider: LLMProvider,
  providerName: ProviderName,
  pdfBuffer: Buffer,
  model: string
): Promise<RawExtractionResult> {
  // Stage 1: Try local text extraction
  let extractedText: string | null = null
  try {
    const parsed = await pdfParse(pdfBuffer)
    if (parsed.text && parsed.text.trim().length > 0) {
      extractedText = parsed.text
    }
  } catch {
    // pdf-parse failed (corrupted PDF, image-only, etc.) — will fall back to document extraction
    console.warn('[extraction] pdf-parse failed, falling back to document extraction')
  }

  // Stage 2: If we have text, send to LLM via complete() (fast, no document upload)
  if (extractedText) {
    const prompt = getTextExtractionPrompt(providerName)
    const filledPrompt = prompt.user.replace('{extracted_text}', extractedText)

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

    // If we got transactions, we're done
    if (result.transactions.length > 0) {
      return result
    }

    // 0 transactions from text — fall through to document extraction
    console.warn('[extraction] Text-based extraction returned 0 transactions, falling back to document extraction')
  }

  // Stage 3: Fallback — full document upload (current behavior)
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
```

Also update the existing test (`'extracts transactions without categories'`) to work with the mock. Since `pdf-parse` is now mocked, add a `beforeEach` to set default behavior:

```typescript
beforeEach(() => {
  mockPdfParse.mockReset()
  // Default: pdf-parse returns some text so the fast path is tried
  mockPdfParse.mockResolvedValue({ text: 'some statement text', numpages: 1 })
})
```

For the existing test that checks `mockExtract`, it now expects `mockComplete` to be called instead (since the fast path succeeds). Update the existing test assertions accordingly — the `mockComplete` should be called with text, not `mockExtract` with document. OR: keep one existing test that specifically tests the fallback path by making `mockComplete` return 0 transactions.

**Step 4: Run all tests to verify they pass**

Run: `npm test -- src/__tests__/lib/llm/extract-transactions.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add "src/lib/llm/extract-transactions.ts" "src/__tests__/lib/llm/extract-transactions.test.ts"
git commit -m "feat: add local PDF text extraction with LLM fallback"
```

---

### Task 4: Add pdf-parse to Next.js server external packages

**Files:**
- Modify: `next.config.ts`

pdf-parse may need to be in `serverExternalPackages` alongside better-sqlite3 if it uses Node.js-specific APIs.

**Step 1: Check if needed**

Run: `npm run build`

If the build fails with pdf-parse bundling errors, add it to `serverExternalPackages` in `next.config.ts`:

```typescript
serverExternalPackages: ['better-sqlite3', 'pdf-parse'],
```

If the build succeeds without changes, skip this step.

**Step 2: Run the build again if modified**

Run: `npm run build`
Expected: PASS

**Step 3: Commit if changes were made**

```bash
git add next.config.ts
git commit -m "chore: add pdf-parse to server external packages"
```

---

### Task 5: Run full test suite and verify build

**Step 1: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual smoke test (optional)**

Start dev server and upload a PDF to verify:
1. Console shows pdf-parse extraction timing
2. Extraction is noticeably faster than before
3. Transactions are correctly extracted

---

### Task 6: Final commit and cleanup

Review all changes, ensure no debug code or console.logs beyond the existing pipeline logging pattern.

```bash
git add -A
git commit -m "feat: local PDF text extraction with pdf-parse and LLM fallback

Uses pdf-parse for fast local text extraction from digital PDFs.
Falls back to full LLM document upload for scanned/image PDFs."
```
