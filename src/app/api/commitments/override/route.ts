import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { setCommitmentOverride, getCommitments } from '@/lib/db/commitments'
import { estimateMonthlyAmount, type CommitmentGroup } from '@/lib/commitments'

const VALID_FREQUENCIES = new Set<string>(['weekly', 'monthly', 'quarterly', 'semi-annual', 'yearly', 'irregular'])

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { merchant, frequencyOverride, monthlyAmountOverride } = body

  if (!merchant || typeof merchant !== 'string') {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }

  const freqValue: CommitmentGroup['frequency'] | null =
    frequencyOverride && VALID_FREQUENCIES.has(frequencyOverride) ? frequencyOverride : null
  const monthlyValue: number | null =
    typeof monthlyAmountOverride === 'number' && monthlyAmountOverride > 0
      ? Math.round(monthlyAmountOverride * 100) / 100
      : monthlyAmountOverride === null ? null : null

  const db = getDb()
  setCommitmentOverride(db, merchant, freqValue, monthlyValue)

  // Recalculate estimated monthly if frequency changed but no monthly override
  let estimatedMonthlyAmount: number | null = null
  if (freqValue && monthlyValue == null) {
    const groups = getCommitments(db, {})
    const group = groups.find(g => g.merchantName === merchant)
    if (group?._transactionData) {
      estimatedMonthlyAmount = Math.round(estimateMonthlyAmount(freqValue, group._transactionData) * 100) / 100
    }
  } else if (monthlyValue != null) {
    estimatedMonthlyAmount = monthlyValue
  }

  return NextResponse.json({ success: true, estimatedMonthlyAmount })
}
