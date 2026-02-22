import { useQuery } from '@tanstack/react-query'
import type { ReportData } from '@/types/reports'

export function useReports(startDate: string, endDate: string, groupBy: string) {
  return useQuery<ReportData>({
    queryKey: ['reports', startDate, endDate, groupBy],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      params.set('group_by', groupBy)
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error('Failed to fetch reports')
      return res.json()
    },
  })
}
