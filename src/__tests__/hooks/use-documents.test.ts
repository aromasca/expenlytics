// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDocuments } from '@/hooks/use-documents'
import React from 'react'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

function makeDoc(overrides: Partial<{ id: number; filename: string; status: string }> = {}) {
  return {
    id: 1,
    filename: 'statement.pdf',
    uploaded_at: '2025-01-01T00:00:00Z',
    status: 'complete',
    processing_phase: null,
    error_message: null,
    document_type: null,
    transaction_count: null,
    actual_transaction_count: 10,
    ...overrides,
  }
}

describe('useDocuments', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches documents with default sort params in the URL', async () => {
    const mockDocs = [makeDoc()]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockDocs), { status: 200 })
    )

    const { result } = renderHook(() => useDocuments(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/documents?sort_by=uploaded_at&sort_order=desc')
  })

  it('fetches documents with custom sort params in the URL', async () => {
    const mockDocs = [makeDoc()]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockDocs), { status: 200 })
    )

    const { result } = renderHook(() => useDocuments('filename', 'asc'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/documents?sort_by=filename&sort_order=asc')
  })

  it('returns documents data on success', async () => {
    const mockDocs = [makeDoc({ id: 1 }), makeDoc({ id: 2, filename: 'other.pdf' })]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockDocs), { status: 200 })
    )

    const { result } = renderHook(() => useDocuments(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockDocs)
  })

  it('handles fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    )

    const { result } = renderHook(() => useDocuments(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('does not poll when no documents are processing', async () => {
    const mockDocs = [makeDoc({ status: 'complete' }), makeDoc({ id: 2, status: 'error' })]
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDocs), { status: 200 })
    )

    const { result } = renderHook(() => useDocuments(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // With no processing documents the refetchInterval returns false, so fetch
    // should only have been called once (the initial load).
    const callCount = (globalThis.fetch as ReturnType<typeof vi.spyOn>).mock.calls.length
    expect(callCount).toBe(1)
  })

  it('polls when a document has status processing', async () => {
    const processingDocs = [makeDoc({ status: 'processing' })]
    const completedDocs = [makeDoc({ status: 'complete' })]

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(processingDocs), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completedDocs), { status: 200 }))

    const { result } = renderHook(() => useDocuments(), { wrapper: createWrapper() })

    // Wait for first fetch — data contains a processing document
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].status).toBe('processing')

    // Wait for the refetch triggered by the 2000ms interval (vitest uses fake timers
    // implicitly via @tanstack/react-query's built-in scheduler; just wait for the
    // second call to arrive).
    await waitFor(() => {
      const callCount = (globalThis.fetch as ReturnType<typeof vi.spyOn>).mock.calls.length
      return expect(callCount).toBeGreaterThanOrEqual(2)
    }, { timeout: 5000 })

    // After the second fetch resolves, data should reflect the completed state.
    await waitFor(() => expect(result.current.data?.[0].status).toBe('complete'))
  })
})
