# Local PDF Text Extraction with LLM Fallback

## Problem

LLM-based PDF extraction (sending the full PDF binary via document upload) is slow. Bank and credit card statements are almost always digitally-born PDFs with embedded text, so the LLM is doing unnecessary work parsing the visual document when the text is already there.

## Solution

Use `pdf-parse` to extract raw text locally (milliseconds), then send that text to the LLM for structuring via `complete()` (text prompt, no document upload). If the LLM returns 0 transactions from the extracted text (e.g., scanned/image-based PDF), fall back to the current full document upload via `extractFromDocument()`.

## Design

### New dependency

`pdf-parse` v2.x — pure TypeScript, zero native deps, 1.2M weekly downloads. API: `pdf(buffer) → { text, numpages, info }`.

### Extraction flow

```
PDF Buffer
    │
    ▼
pdf-parse(buffer) → raw text (milliseconds)
    │
    ▼
LLM complete() with raw text as prompt → RawExtractionResult
    │
    ├─ transactions.length > 0 → done
    │
    └─ transactions.length === 0 → fallback:
         LLM extractFromDocument(buffer) → RawExtractionResult (current behavior)
```

### New prompt variant

A "text extraction" prompt for when raw text is sent inline (not a PDF document). Similar to the current raw extraction prompt but framed as "parse the following financial statement text" (covers bank statements, credit card statements, and other financial documents). Provider-specific variants for Anthropic (XML tags) and OpenAI (markdown headers) in `src/lib/llm/prompts/extraction.ts`.

### Changes to `extractRawTransactions`

In `src/lib/llm/extract-transactions.ts`:

1. Import `pdf-parse`
2. Stage 1: `const { text } = await pdfParse(pdfBuffer)` — local text extraction
3. Stage 2: Call `provider.complete()` with text-based prompt (NOT `extractFromDocument`)
4. Stage 3 (fallback): If result has 0 transactions, log warning and call `provider.extractFromDocument()` with original buffer
5. Return type unchanged: `RawExtractionResult`

### Pipeline impact

None. `pipeline.ts` already calls `extractRawTransactions()` and receives `RawExtractionResult`. The optimization is fully encapsulated.

### Settings/UI changes

None. This is a transparent internal optimization.

## Decisions

- **Strategy:** Local-first with LLM fallback (try text extraction, fall back to document upload)
- **Structuring:** LLM structures extracted text (no regex/heuristic parsers)
- **Fallback trigger:** 0 transactions from text-based extraction triggers document upload retry
- **Library:** pdf-parse (mature, zero native deps, simple API)
- **Approach:** Sequential fallback (fast path first, then document upload if needed)
