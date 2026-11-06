import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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

  it('renders with viewport props without crashing', () => {
    const onMove = vi.fn()
    render(
      <GraphCanvas
        nodes={[]}
        edges={[]}
        applyViewport={{ x: 10, y: 20, zoom: 2 }}
        onMove={onMove}
        fitView={false}
      />,
    )
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })

  it('does not forward onMove caused by applying the viewport', async () => {
    // setViewport() runs a programmatic d3-zoom transform; ReactFlow surfaces it
    // through onMove with sourceEvent=null — that echo is not user interaction.
    // The viewport must arrive AFTER onInit (like the async-loaded visualization):
    // rerender once the instance exists, or the apply effect never fires.
    const onMove = vi.fn()
    const utils = render(<GraphCanvas nodes={[]} edges={[]} onMove={onMove} fitView={false} />)
    // let ReactFlow initialize (onInit fires on a later tick in jsdom)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    utils.rerender(
      <GraphCanvas
        nodes={[]}
        edges={[]}
        applyViewport={{ x: 10, y: 20, zoom: 2 }}
        onMove={onMove}
        fitView={false}
      />,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(onMove).not.toHaveBeenCalled()
  })
})
