// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SortableHeader } from '@/components/shared/sortable-header'
import React from 'react'

// SortableHeader renders a <th> which must be inside <table><thead><tr>
function renderInTable(ui: React.ReactElement) {
  return render(
    <table><thead><tr>{ui}</tr></thead></table>
  )
}

describe('SortableHeader', () => {
  it('renders label text', () => {
    renderInTable(
      <SortableHeader column="date" label="Date" currentSort="date" currentOrder="asc" onSort={() => {}} />
    )
    expect(screen.getByText('Date')).toBeInTheDocument()
  })

  it('calls onSort with column when clicked', () => {
    const onSort = vi.fn()
    renderInTable(
      <SortableHeader column="amount" label="Amount" currentSort="date" currentOrder="asc" onSort={onSort} />
    )
    fireEvent.click(screen.getByText('Amount'))
    expect(onSort).toHaveBeenCalledWith('amount')
  })

  it('shows directional arrow for active column', () => {
    const { container } = renderInTable(
      <SortableHeader column="date" label="Date" currentSort="date" currentOrder="desc" onSort={() => {}} />
    )
    // Should have an SVG icon (ArrowDown for desc)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(1)
  })

  it('shows muted arrow for inactive column', () => {
    const { container } = renderInTable(
      <SortableHeader column="amount" label="Amount" currentSort="date" currentOrder="asc" onSort={() => {}} />
    )
    // Should have ArrowUpDown with opacity-30
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
