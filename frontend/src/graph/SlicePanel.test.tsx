import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlicePanel } from './SlicePanel'
import type { Slice } from '../api/types'

const slices: Slice[] = [
  { id: 's1', name: 'core', description: 'ядро системы', nodeCount: 3 },
  { id: 's2', name: 'edge', description: '', nodeCount: 0 },
]

function props(overrides: Partial<Parameters<typeof SlicePanel>[0]> = {}) {
  return {
    slices,
    activeSliceId: null,
    visibleSlices: null,
    onActivate: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onToggleVisible: vi.fn(),
    onSetAllVisible: vi.fn(),
    onSetNoneVisible: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('SlicePanel', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the list with name, trimmed description, and member count', () => {
    render(<SlicePanel {...props()} />)
    expect(screen.getByTestId('slice-name-s1').textContent).toBe('core')
    expect(screen.getByTestId('slice-desc-s1').textContent).toBe('ядро системы')
    expect(screen.getByTestId('slice-count-s1').textContent).toBe('3')
    // empty description renders no description node
    expect(screen.queryByTestId('slice-desc-s2')).not.toBeInTheDocument()
    expect(screen.getByTestId('slice-count-s2').textContent).toBe('0')
  })

  it('create form submits name and description, blank name rejected', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    // blank name — rejected client-side
    fireEvent.click(screen.getByTestId('slice-create-ok'))
    expect(p.onCreate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('slice-create-name'), { target: { value: 'новый' } })
    fireEvent.change(screen.getByTestId('slice-create-desc'), { target: { value: 'описание' } })
    fireEvent.click(screen.getByTestId('slice-create-ok'))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'новый', description: 'описание' })
  })

  it('create form omits an empty description', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.change(screen.getByTestId('slice-create-name'), { target: { value: 'голый' } })
    fireEvent.click(screen.getByTestId('slice-create-ok'))
    expect(p.onCreate).toHaveBeenCalledWith({ name: 'голый' })
  })

  it('inline rename prefills name and description and submits both', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-rename-s1'))
    expect((screen.getByTestId('slice-edit-name-s1') as HTMLInputElement).value).toBe('core')
    expect((screen.getByTestId('slice-edit-desc-s1') as HTMLInputElement).value).toBe('ядро системы')
    fireEvent.change(screen.getByTestId('slice-edit-name-s1'), { target: { value: 'ядро' } })
    fireEvent.change(screen.getByTestId('slice-edit-desc-s1'), { target: { value: 'обновлено' } })
    fireEvent.click(screen.getByTestId('slice-edit-ok-s1'))
    expect(p.onRename).toHaveBeenCalledWith('s1', { name: 'ядро', description: 'обновлено' })
    // edit mode closed
    expect(screen.queryByTestId('slice-edit-name-s1')).not.toBeInTheDocument()
  })

  it('inline rename cancel keeps the row untouched', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-rename-s1'))
    fireEvent.change(screen.getByTestId('slice-edit-name-s1'), { target: { value: 'x' } })
    fireEvent.click(screen.getByTestId('slice-edit-cancel-s1'))
    expect(p.onRename).not.toHaveBeenCalled()
    expect(screen.getByTestId('slice-name-s1').textContent).toBe('core')
  })

  it('delete asks for confirm and only fires onDelete on accept', () => {
    const p = props()
    ;(window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false)
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-delete-s1'))
    expect(p.onDelete).not.toHaveBeenCalled()
    ;(window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)
    fireEvent.click(screen.getByTestId('slice-delete-s1'))
    expect(p.onDelete).toHaveBeenCalledWith('s1')
  })

  it('checkboxes reflect visibleSlices and toggle per slice', () => {
    const p = props({ visibleSlices: new Set(['s1']) })
    render(<SlicePanel {...p} />)
    expect(screen.getByTestId('slice-visible-s1')).toBeChecked()
    expect(screen.getByTestId('slice-visible-s2')).not.toBeChecked()
    fireEvent.click(screen.getByTestId('slice-visible-s1'))
    fireEvent.click(screen.getByTestId('slice-visible-s2'))
    expect(p.onToggleVisible).toHaveBeenCalledWith('s1')
    expect(p.onToggleVisible).toHaveBeenCalledWith('s2')
  })

  it('«Все» / «Ни одного» call the filter setters', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-visible-all'))
    expect(p.onSetAllVisible).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('slice-visible-none'))
    expect(p.onSetNoneVisible).toHaveBeenCalled()
  })

  it('checkboxes are greyed out while no visualization is loaded', () => {
    render(<SlicePanel {...props({ canFilter: false })} />)
    expect(screen.getByTestId('slice-visible-s1')).toBeDisabled()
    expect(screen.getByTestId('slice-visible-all')).toBeDisabled()
    expect(screen.getByTestId('slice-visible-none')).toBeDisabled()
  })

  it('highlights the active slice row', () => {
    render(<SlicePanel {...props({ activeSliceId: 's2' })} />)
    expect(screen.getByTestId('slice-row-s2')).toHaveClass('active')
    expect(screen.getByTestId('slice-row-s1')).not.toHaveClass('active')
  })

  it('«Показать» activates the slice', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-activate-s2'))
    expect(p.onActivate).toHaveBeenCalledWith('s2')
  })

  it('«Только срез» toggle fires back and needs an active slice', () => {
    const onToggleSliceOnly = vi.fn()
    // no active slice — disabled
    const first = render(
      <SlicePanel {...props({ activeSliceId: null })} onToggleSliceOnly={onToggleSliceOnly} />,
    )
    expect(screen.getByTestId('slice-only-toggle')).toBeDisabled()
    first.unmount()
    // with an active slice it toggles and reflects the mode
    render(<SlicePanel {...props({ activeSliceId: 's1', sliceOnly: true, onToggleSliceOnly })} />)
    expect(screen.getByTestId('slice-only-toggle')).toBeChecked()
    expect(screen.getByTestId('slice-only-toggle')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('slice-only-toggle'))
    expect(onToggleSliceOnly).toHaveBeenCalled()
  })

  it('close button fires onClose', () => {
    const p = props()
    render(<SlicePanel {...p} />)
    fireEvent.click(screen.getByTestId('slice-panel-close'))
    expect(p.onClose).toHaveBeenCalled()
  })
})
