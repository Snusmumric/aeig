import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VizDiffBar, type VizDiffBarProps } from './VizDiffBar'

function props(overrides: Partial<VizDiffBarProps> = {}): VizDiffBarProps {
  return {
    deletedCount: 3,
    addedCount: 5,
    showDeleted: true,
    showAdded: true,
    onToggleDeleted: vi.fn(),
    onToggleAdded: vi.fn(),
    onSync: vi.fn(),
    ...overrides,
  }
}

describe('VizDiffBar', () => {
  it('renders the staleness message with counts and the sync button', () => {
    render(<VizDiffBar {...props()} />)
    const bar = screen.getByTestId('viz-diff-bar')
    expect(bar.textContent).toContain('−3')
    expect(bar.textContent).toContain('+5')
    expect(screen.getByText('Удалённое (3)')).toBeInTheDocument()
    expect(screen.getByText('Новое (5)')).toBeInTheDocument()
    expect(screen.getByText('Синхронизировать')).toBeInTheDocument()
  })

  it('toggles carry layer visibility in aria-pressed and fire their callbacks', () => {
    const p = props({ showAdded: false })
    render(<VizDiffBar {...p} />)
    expect(screen.getByTestId('toggle-deleted')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('toggle-added')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByTestId('toggle-deleted'))
    fireEvent.click(screen.getByTestId('toggle-added'))
    expect(p.onToggleDeleted).toHaveBeenCalledTimes(1)
    expect(p.onToggleAdded).toHaveBeenCalledTimes(1)
  })

  it('sync button fires onSync', () => {
    const p = props()
    render(<VizDiffBar {...p} />)
    fireEvent.click(screen.getByText('Синхронизировать'))
    expect(p.onSync).toHaveBeenCalledTimes(1)
  })
})
