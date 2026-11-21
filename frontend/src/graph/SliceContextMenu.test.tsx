import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SliceContextMenu } from './SliceContextMenu'
import type { Slice } from '../api/types'

const slices: Slice[] = [
  { id: 's1', name: 'core', description: '', nodeCount: 2 },
  { id: 's2', name: 'aux', description: '', nodeCount: 1 },
]

describe('SliceContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('node mode: renders per-slice rows with checkmarks from memberships', () => {
    const onToggle = vi.fn()
    render(
      <SliceContextMenu
        x={10}
        y={20}
        slices={slices}
        memberships={['s1']}
        onToggle={onToggle}
        onCreateNew={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('slice-menu-check-s1')).toBeChecked()
    expect(screen.getByTestId('slice-menu-check-s2')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('slice-menu-check-s2'))
    expect(onToggle).toHaveBeenCalledWith('s2')
  })

  it('node mode: «новый срез…» opens an inline name input and submits', () => {
    const onCreateNew = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        memberships={[]}
        onToggle={vi.fn()}
        onCreateNew={onCreateNew}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('slice-menu-new'))
    fireEvent.change(screen.getByTestId('slice-menu-new-name'), { target: { value: 'новый' } })
    fireEvent.click(screen.getByTestId('slice-menu-new-ok'))
    expect(onCreateNew).toHaveBeenCalledWith('новый')
    // blank name is rejected
    fireEvent.click(screen.getByTestId('slice-menu-new'))
    fireEvent.click(screen.getByTestId('slice-menu-new-ok'))
    expect(onCreateNew).toHaveBeenCalledTimes(1)
  })

  it('edge mode: rows have no checkboxes; clicking fires onToggle', () => {
    const onToggle = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        disabledSlices={new Set<string>()}
        onToggle={onToggle}
        onCreateNew={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('slice-menu-check-s1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('slice-menu-new')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('slice-menu-add-s1'))
    expect(onToggle).toHaveBeenCalledWith('s1')
  })

  it('edge mode: slices with both endpoints already members are disabled with a hint', () => {
    const onToggle = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        disabledSlices={new Set(['s1'])}
        onToggle={onToggle}
        onCreateNew={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const disabled = screen.getByTestId('slice-menu-add-s1') as HTMLButtonElement
    expect(disabled).toBeDisabled()
    expect(disabled).toHaveAttribute('title', 'Оба конца уже в срезе')
    fireEvent.click(screen.getByTestId('slice-menu-add-s2'))
    expect(onToggle).toHaveBeenCalledWith('s2')
    expect(onToggle).not.toHaveBeenCalledWith('s1')
  })

  it('is positioned at the cursor coordinates', () => {
    render(
      <SliceContextMenu
        x={123}
        y={45}
        slices={[]}
        memberships={[]}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const el = screen.getByTestId('slice-context-menu')
    expect(el.style.left).toBe('123px')
    expect(el.style.top).toBe('45px')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        memberships={[]}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on click-outside but not on clicks inside', () => {
    const onClose = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        memberships={[]}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.mouseDown(screen.getByTestId('slice-menu-check-s1'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on scroll', () => {
    const onClose = vi.fn()
    render(
      <SliceContextMenu
        x={0}
        y={0}
        slices={slices}
        memberships={[]}
        onToggle={vi.fn()}
        onCreateNew={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.scroll(screen.getByTestId('slice-context-menu'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
