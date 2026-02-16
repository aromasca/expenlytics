/**
 * Shared date preset utility for computing start/end date ranges.
 * Each page may use a different subset of these presets.
 */

export function getDatePreset(preset: string): { start: string; end: string } {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const today = `${yyyy}-${mm}-${dd}`
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    // filter-bar presets
    case 'last30': {
      const d = new Date(now)
      d.setDate(d.getDate() - 30)
      return { start: fmt(d), end: today }
    }
    case 'thisMonth':
      return { start: `${yyyy}-${mm}-01`, end: today }
    case 'last3Months': {
      const d = new Date(yyyy, now.getMonth() - 2, 1)
      return { start: fmt(d), end: today }
    }
    case 'thisYear':
      return { start: `${yyyy}-01-01`, end: today }

    // reports presets
    case '1mo': {
      const d = new Date(yyyy, now.getMonth() - 1, now.getDate())
      return { start: fmt(d), end: today }
    }
    case '3mo': {
      const d = new Date(yyyy, now.getMonth() - 3, now.getDate())
      return { start: fmt(d), end: today }
    }
    case '6mo': {
      const d = new Date(yyyy, now.getMonth() - 6, now.getDate())
      return { start: fmt(d), end: today }
    }
    case '1yr': {
      const d = new Date(yyyy - 1, now.getMonth(), now.getDate())
      return { start: fmt(d), end: today }
    }

    // subscriptions presets
    case 'last12Months': {
      const d = new Date(yyyy - 1, now.getMonth(), now.getDate())
      return { start: fmt(d), end: today }
    }

    case 'all':
    default:
      return { start: '', end: '' }
  }
}
