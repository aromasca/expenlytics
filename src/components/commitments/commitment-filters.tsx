'use client'

import { DateRangePicker } from '@/components/shared/date-range-picker'

interface CommitmentFiltersProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
}

export function CommitmentFilters({ startDate, endDate, onChange }: CommitmentFiltersProps) {
  return (
    <DateRangePicker
      startDate={startDate}
      endDate={endDate}
      onChange={(s, e) => onChange(s, e)}
      presets={[
        { label: '12mo', value: 'last12Months' },
        { label: 'YTD', value: 'thisYear' },
        { label: 'All', value: 'all' },
      ]}
    />
  )
}
