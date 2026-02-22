export interface DocumentRow {
  id: number
  filename: string
  uploaded_at: string
  status: string
  processing_phase: string | null
  error_message: string | null
  document_type: string | null
  transaction_count: number | null
  actual_transaction_count: number
}

export type DocumentSortBy = 'filename' | 'uploaded_at' | 'document_type' | 'status' | 'actual_transaction_count'
