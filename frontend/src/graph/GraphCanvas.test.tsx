import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'

describe('GraphCanvas', () => {
  it('mounts the canvas container without crashing', () => {
    render(<GraphCanvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })

  it('renders with drag handler props without crashing', () => {
    const noop = () => {}
    render(
      <GraphCanvas nodes={[]} edges={[]} onNodeDragStart={noop} onNodeDrag={noop} onNodeDragStop={noop} />,
    )
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })
})
