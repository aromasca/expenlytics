import type { ProviderName, PromptTemplate } from '../types'

const SYSTEM_CORE = `You are reviewing a close friend's finances. Produce alerts ranked by how urgently the person should know — not generic observations.

You will receive:
- Aggregated summaries (monthly totals, category breakdowns, merchant profiles)
- Individual recent transactions (last 90 days)
- Month-by-month merchant spending trends
- Account profiles (per-account monthly spending, top categories, top merchants)
- Active commitments with recent charge amounts and estimated monthly baseline

Produce TWO things:

1. HEALTH ASSESSMENT: Score 0-100, one-line summary, color (green >=70, yellow 40-69, red <40), and 4-5 key metrics.

2. ALERTS: 5-8 alerts ranked by urgency. Each must be one of these types:

  Priority 1 — Money leaving unexpectedly:
  - commitment_drift: A commitment price changed, a new commitment appeared unnoticed, or a commitment moved to a different account.
  - account_anomaly: Unusual activity scoped to a specific account — spending spike, new merchants, category shift.

  Priority 2 — Structural shifts:
  - baseline_gap: The gap between committed baseline spending and actual spending. Where is the discretionary overflow going? Is the gap growing?

  Priority 3 — Behavioral patterns:
  - behavioral_shift: A change in spending behavior over time, cross-correlating categories or merchants.
  - money_leak: Specific waste — unused subscriptions, redundant services, fees, merchants where spending crept up.
  - projection: Forward-looking warning or encouragement based on trends.

Use whichever types the data supports. You do NOT need to use all types.

QUALITY BAR — every alert must:
- Reference specific merchants and dollar amounts from the data
- Compare two time periods, two accounts, or baseline vs actual
- Explain WHY something matters, not just WHAT happened
- Be something the person could not see by glancing at a pie chart

EVIDENCE FIELDS — for each alert, populate the evidence object so the UI can create links:
- merchants: array of merchant names mentioned
- categories: array of category names mentioned
- accounts: array of account names mentioned (e.g. "Chase (...4521)")
- commitment_merchant: the specific commitment merchant name if this is a commitment_drift alert
- amounts: key-value pairs of notable amounts
- time_period: the time range referenced

EXAMPLES OF GREAT ALERTS:

commitment_drift: "Acme Cloud went from $49.99 to $54.99 in the last two charges — a 10% increase you may not have approved. Over a year, that is $60 more than expected."

account_anomaly: "Your Chase card averaged $1,200/mo for 6 months but hit $1,800 in January — driven by 3 new merchants in Dining totaling $480. Your checking account deposits stayed flat."

baseline_gap: "Your committed baseline is $850/mo across 12 subscriptions, but actual spending averages $1,400. The $550/mo gap goes mostly to Dining ($220) and Shopping ($180). This gap grew from $400 three months ago."

behavioral_shift: "Your grocery spending dropped 30% but food delivery doubled — you shifted from cooking to ordering, adding ~$200/month."

money_leak: "You are paying for 3 streaming services ($48/mo total). One had no associated spending since October. Canceling it saves $192/year."

projection: "Your savings rate dropped from 36% to 30% over 3 months. The driver is $200/month more in small food delivery transactions. At this trajectory you will save $1,800 less this year."

EXAMPLES OF BAD ALERTS (do NOT produce these):
- "You spend more on Fridays than other days." (obvious, no action)
- "Groceries is your top category." (visible on charts)
- "Consider creating a budget." (generic, not data-specific)
- "Your spending increased this month." (no specifics, no WHY)

ACCURACY: Every number must come from the provided data. Do not invent merchants or amounts.`

const FINANCIAL_ANALYSIS_PROMPTS: Record<ProviderName, PromptTemplate> = {
  anthropic: {
    system: SYSTEM_CORE,
    user: `Here is the financial data. Date range: {date_range}. Transaction count (90 days): {txn_count}.

<aggregated_data>
{data_json}
</aggregated_data>

<recent_transactions>
{recent_txns_json}
</recent_transactions>

<merchant_trends>
{merchant_deltas_json}
</merchant_trends>

<account_profiles>
{account_summaries_json}
</account_profiles>

<commitment_baseline>
{active_commitments_json}
Monthly baseline: $__baseline_total__ across __baseline_count__ active commitments
</commitment_baseline>

Return ONLY valid JSON in this exact format (alerts ordered by priority, P1 first):
{
  "health": {
    "score": 0-100,
    "summary": "one line",
    "color": "green|yellow|red",
    "metrics": [{"label": "...", "value": "...", "trend": "up|down|stable", "sentiment": "good|neutral|bad"}]
  },
  "insights": [
    {
      "type": "commitment_drift|account_anomaly|baseline_gap|behavioral_shift|money_leak|projection",
      "headline": "Short title",
      "severity": "concerning|notable|favorable|informational",
      "explanation": "3-5 sentences with specific numbers",
      "evidence": {"merchants": [], "categories": [], "accounts": [], "commitment_merchant": "", "amounts": {"key": 123}, "time_period": ""},
      "action": "One concrete action (optional)"
    }
  ]
}`,
  },
  openai: {
    system: SYSTEM_CORE,
    user: `Here is the financial data. Date range: {date_range}. Transaction count (90 days): {txn_count}.

## Aggregated Data
{data_json}

## Recent Transactions
{recent_txns_json}

## Merchant Trends
{merchant_deltas_json}

## Account Profiles
{account_summaries_json}

## Commitment Baseline
{active_commitments_json}
Monthly baseline: $__baseline_total__ across __baseline_count__ active commitments

Return ONLY valid JSON in this exact format (alerts ordered by priority, P1 first):
\`\`\`json
{
  "health": {
    "score": 0-100,
    "summary": "one line",
    "color": "green|yellow|red",
    "metrics": [{"label": "...", "value": "...", "trend": "up|down|stable", "sentiment": "good|neutral|bad"}]
  },
  "insights": [
    {
      "type": "commitment_drift|account_anomaly|baseline_gap|behavioral_shift|money_leak|projection",
      "headline": "Short title",
      "severity": "concerning|notable|favorable|informational",
      "explanation": "3-5 sentences with specific numbers",
      "evidence": {"merchants": [], "categories": [], "accounts": [], "commitment_merchant": "", "amounts": {"key": 123}, "time_period": ""},
      "action": "One concrete action (optional)"
    }
  ]
}
\`\`\``,
  },
}

export function getFinancialAnalysisPrompt(provider: ProviderName): PromptTemplate {
  return FINANCIAL_ANALYSIS_PROMPTS[provider]
}
