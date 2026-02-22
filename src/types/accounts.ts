export interface AccountData {
  id: number
  name: string
  institution: string | null
  last_four: string | null
  type: string
  documentCount: number
  months: Record<string, { status: 'complete' | 'missing'; documents: Array<{ filename: string; statementDate: string | null }> }>
}

export interface UnassignedDoc {
  id: number
  filename: string
  document_type: string | null
  status: string
}
