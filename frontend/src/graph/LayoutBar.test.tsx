import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayoutBar } from './LayoutBar'
import type { Layout } from '../api/types'

const layouts: Layout[] = [
  { id: 'l1', graphId: 'g1', name: 'default', positions: {}, viewport: { x: 0, y: 0, zoom: 1 }, createdAt: '' },
]

describe('LayoutBar', () => {
  it('calls onSave with the typed name', () => {
    const onSave = vi.fn()
    render(<LayoutBar layouts={[]} onSave={onSave} onLoad={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('layout name'), { target: { value: 'v2' } })
    fireEvent.click(screen.getByText('Save layout'))
    expect(onSave).toHaveBeenCalledWith('v2')
  })

  it('calls onLoad when a saved layout is clicked', () => {
    const onLoad = vi.fn()
    render(<LayoutBar layouts={layouts} onSave={vi.fn()} onLoad={onLoad} />)
    fireEvent.click(screen.getByText('default'))
    expect(onLoad).toHaveBeenCalledWith('default')
  })
})
