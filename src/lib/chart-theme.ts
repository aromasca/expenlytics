export const CHART_COLORS = {
  light: {
    text: '#737373',
    grid: '#E5E5E5',
    fg: '#0A0A0A',
    bg: '#FFFFFF',
    cardBg: '#FFFFFF',
    green: '#10B981',
    red: '#F43F5E',
    stroke: '#525252',
    dotFill: '#FFFFFF',
  },
  dark: {
    text: '#A1A1AA',
    grid: '#27272A',
    fg: '#FAFAFA',
    bg: '#18181B',
    cardBg: '#111113',
    green: '#34D399',
    red: '#FB7185',
    stroke: '#A1A1AA',
    dotFill: '#18181B',
  },
} as const

export type ChartTheme = { [K in keyof (typeof CHART_COLORS)['light']]: string }

export function getChartColors(isDark: boolean): ChartTheme {
  return isDark ? CHART_COLORS.dark : CHART_COLORS.light
}
