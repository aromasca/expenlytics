import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const MUST_USE_VIEW = [
  'src/lib/db/reports.ts',
  'src/lib/db/health.ts',
  'src/lib/db/commitments.ts',
  'src/lib/db/merchants.ts',
  'src/lib/insights/compact-data.ts',
]

// Files with known legitimate raw FROM transactions uses and their expected counts
const ALLOWED_RAW_COUNTS: Record<string, number> = {
  // compact-data.ts: income dates query (needs salary categories) + account lookup join
  'src/lib/insights/compact-data.ts': 2,
}

describe('transaction query hygiene', () => {
  for (const filePath of MUST_USE_VIEW) {
    it(`${filePath} uses valid_transactions, not raw transactions`, () => {
      const content = readFileSync(join(process.cwd(), filePath), 'utf-8')
      const lines = content.split('\n')
      const rawQueryLines = lines.filter(line => {
        return /FROM\s+transactions\b/i.test(line)
          && !/FROM\s+valid_transactions/i.test(line)
          && !/excluded_commitment_transactions/i.test(line)
      })

      const allowed = ALLOWED_RAW_COUNTS[filePath] ?? 0
      expect(rawQueryLines).toHaveLength(allowed)
    })
  }

  it('VALID_TRANSACTION_FILTER is not imported anywhere', () => {
    for (const filePath of MUST_USE_VIEW) {
      const content = readFileSync(join(process.cwd(), filePath), 'utf-8')
      expect(content).not.toContain('VALID_TRANSACTION_FILTER')
    }
  })
})
