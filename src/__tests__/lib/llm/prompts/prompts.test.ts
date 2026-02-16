import { describe, it, expect } from 'vitest'
import { getRawExtractionPrompt, getLegacyExtractionPrompt } from '@/lib/llm/prompts/extraction'
import { getClassifyPrompt, getReclassifyPrompt } from '@/lib/llm/prompts/classification'
import { getNormalizationPrompt } from '@/lib/llm/prompts/normalization'
import { getFinancialAnalysisPrompt } from '@/lib/llm/prompts/insights'
import type { ProviderName } from '@/lib/llm/types'

const providers: ProviderName[] = ['anthropic', 'openai']

describe('prompt getters', () => {
  for (const provider of providers) {
    describe(`${provider} provider`, () => {
      it('getRawExtractionPrompt returns user prompt', () => {
        const prompt = getRawExtractionPrompt(provider)
        expect(prompt.user).toBeTruthy()
        expect(prompt.user.length).toBeGreaterThan(100)
      })

      it('getLegacyExtractionPrompt returns user prompt with categories', () => {
        const prompt = getLegacyExtractionPrompt(provider)
        expect(prompt.user).toBeTruthy()
        expect(prompt.user).toContain('category')
      })

      it('getClassifyPrompt returns user prompt with placeholders', () => {
        const prompt = getClassifyPrompt(provider)
        expect(prompt.user).toContain('{document_type}')
        expect(prompt.user).toContain('{transactions_json}')
        expect(prompt.user).toContain('{known_mappings}')
      })

      it('getReclassifyPrompt returns user prompt with placeholders', () => {
        const prompt = getReclassifyPrompt(provider)
        expect(prompt.user).toContain('{document_type}')
        expect(prompt.user).toContain('{transactions_json}')
      })

      it('getNormalizationPrompt returns user prompt with placeholders', () => {
        const prompt = getNormalizationPrompt(provider)
        expect(prompt.user).toContain('{descriptions_json}')
        expect(prompt.user).toContain('{existing_merchants_block}')
      })

      it('getFinancialAnalysisPrompt returns system and user with placeholders', () => {
        const prompt = getFinancialAnalysisPrompt(provider)
        expect(prompt.system).toBeTruthy()
        expect(prompt.system).toContain('close friend')
        expect(prompt.user).toContain('{data_json}')
        expect(prompt.user).toContain('{recent_txns_json}')
        expect(prompt.user).toContain('{merchant_deltas_json}')
      })
    })
  }
})
