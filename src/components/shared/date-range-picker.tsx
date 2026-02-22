'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getDatePreset } from '@/lib/date-presets'

export interface DateRangePreset {
  label: string
  value: string
}

const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: '1mo', value: '1mo' },
  { label: '3mo', value: '3mo' },
  { label: '6mo', value: '6mo' },
  { label: '1yr', value: '1yr' },
  { label: 'All', value: 'all' },
]

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  presets?: boolean | DateRangePreset[]
}

export function DateRangePicker({ startDate, endDate, onChange, presets = true }: DateRangePickerProps) {
  const presetList: DateRangePreset[] | false =
    presets === false
      ? false
      : presets === true
        ? DEFAULT_PRESETS
        : presets

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">From</span>
        <Input
          type="date"
          value={startDate}
          onChange={e => onChange(e.target.value, endDate)}
          className="w-32 h-8 text-xs dark:[color-scheme:dark]"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">To</span>
        <Input
          type="date"
          value={endDate}
          onChange={e => onChange(startDate, e.target.value)}
          className="w-32 h-8 text-xs dark:[color-scheme:dark]"
        />
      </div>
      {presetList && presetList.length > 0 && (
        <div className="flex gap-1">
          {presetList.map(p => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                const { start, end } = getDatePreset(p.value)
                onChange(start, end)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
