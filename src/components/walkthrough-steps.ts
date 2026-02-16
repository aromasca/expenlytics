export interface WalkthroughStep {
  page: string
  target: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'right'
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    page: '/insights',
    target: 'sidebar',
    title: 'Welcome to Expenlytics!',
    description: "This is your dashboard. Let's walk through how to get started.",
    position: 'right',
  },
  {
    page: '/documents',
    target: 'upload',
    title: 'Upload a Statement',
    description: "Drop a bank or credit card PDF here. We'll extract and categorize every transaction automatically.",
    position: 'bottom',
  },
  {
    page: '/transactions',
    target: 'transactions',
    title: 'Review Transactions',
    description: 'All extracted transactions appear here. You can edit categories, types, and merchant names.',
    position: 'top',
  },
  {
    page: '/reports',
    target: 'reports',
    title: 'Explore Reports',
    description: 'See spending breakdowns, savings rate, month-over-month comparisons, and a Sankey flow diagram.',
    position: 'top',
  },
  {
    page: '/insights',
    target: 'health-score',
    title: 'Get Insights',
    description: 'Your financial health score, spending patterns, and personalized recommendations live here.',
    position: 'bottom',
  },
]
