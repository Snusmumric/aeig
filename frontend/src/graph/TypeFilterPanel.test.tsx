import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TypeFilterPanel } from './TypeFilterPanel'
import type { TypeStyleMap } from './typeStyle'

const styles: TypeStyleMap = { phase: { shape: 'diamond', color: '#dc2626' } }

describe('TypeFilterPanel', () => {
  it('renders a labeled checkbox per type with a swatch', () => {
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={null} styles={styles} onChange={vi.fn()} />)
    expect(screen.getByTestId('type-phase')).toBeChecked()
    expect(screen.getByTestId('type-slice')).toBeChecked()
    expect(screen.getByText('phase')).toBeInTheDocument()
  })

  it('unchecking a type calls onChange with that type excluded', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={null} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('type-phase'))
    expect(onChange).toHaveBeenCalledWith(new Set(['slice']))
  })

  it('checking the last unchecked type normalizes to null', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={new Set(['slice'])} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('type-phase'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Все / Ни одного buttons', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase']} visibleTypes={new Set()} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByText('Все'))
    expect(onChange).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByText('Ни одного'))
    expect(onChange).toHaveBeenCalledWith(new Set())
  })
})
