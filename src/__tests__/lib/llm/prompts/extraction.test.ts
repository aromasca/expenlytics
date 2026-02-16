import { describe, it, expect } from 'vitest'
import { getTextExtractionPrompt } from '@/lib/llm/prompts/extraction'

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

  it('text prompt does NOT mention document parser', () => {
    const anthropic = getTextExtractionPrompt('anthropic')
    const openai = getTextExtractionPrompt('openai')
    expect(anthropic.user).not.toContain('document parser')
    expect(openai.user).not.toContain('document parser')
  })
})
