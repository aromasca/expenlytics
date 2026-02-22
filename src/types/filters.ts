export interface Filters {
  search: string
  type: '' | 'debit' | 'credit'
  start_date: string
  end_date: string
  category_ids: number[]
  document_id: string
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  start_date: '',
  end_date: '',
  category_ids: [],
  document_id: '',
}
