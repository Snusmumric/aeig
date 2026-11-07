import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ReactFlowProvider, type EdgeProps } from '@xyflow/react'
import { CurvyEdge, EdgeBendContext } from './CurvyEdge'

// EdgeText measures its label via SVG getBBox — not implemented in jsdom
beforeAll(() => {
  ;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
})

function renderEdge(props: Partial<EdgeProps> = {}) {
  const onEdgeBend = vi.fn()
  const base: EdgeProps = {
    id: 'e1',
    source: 'n1',
    target: 'n2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 0,
    data: {},
  } as EdgeProps
  const utils = render(
    <svg>
      <ReactFlowProvider>
        <EdgeBendContext.Provider value={{ onEdgeBend }}>
          <CurvyEdge {...base} {...props} />
        </EdgeBendContext.Provider>
      </ReactFlowProvider>
    </svg>,
  )
  return { ...utils, onEdgeBend }
}

describe('CurvyEdge', () => {
  it('unbent path is the straight segment (zero-offset quad)', () => {
    const { container } = renderEdge()
    const path = container.querySelector('.react-flow__edge-path') as SVGPathElement
    expect(path.getAttribute('d')).toBe('M 0,0 Q 50,0 100,0')
  })

  it('applies the bend as control point C = M + 2·off', () => {
    const { container } = renderEdge({ data: { bend: { dx: 10, dy: -5 } } })
    const path = container.querySelector('.react-flow__edge-path') as SVGPathElement
    // mid (50,0) + 2·(10,−5) = (70,−10)
    expect(path.getAttribute('d')).toBe('M 0,0 Q 70,-10 100,0')
  })

  it('renders three grab circles at u = 0.25/0.5/0.75', () => {
    const { getByTestId } = renderEdge()
    expect(getByTestId('edge-grab-e1-0.25')).toBeInTheDocument()
    expect(getByTestId('edge-grab-e1-0.5')).toBeInTheDocument()
    expect(getByTestId('edge-grab-e1-0.75')).toBeInTheDocument()
  })

  it('renders the edge-type label', () => {
    const { getByText } = renderEdge({ label: 'depends_on' })
    expect(getByText('depends_on')).toBeInTheDocument()
  })

  it('dragging the u=0.5 circle reports the through-point offset (plain pointer events)', () => {
    const { getByTestId, onEdgeBend } = renderEdge()
    const grab = getByTestId('edge-grab-e1-0.5')
    fireEvent.pointerDown(grab, { pointerId: 3, clientX: 50, clientY: 0 })
    // pointer at mid + (30,10) → at u=0.5 offset = P − M
    fireEvent.pointerMove(grab, { pointerId: 3, clientX: 80, clientY: 10 })
    fireEvent.pointerUp(grab, { pointerId: 3, clientX: 80, clientY: 10 })
    expect(onEdgeBend).toHaveBeenCalledWith('e1', { dx: 30, dy: 10 })
  })

  it('dragging the u=0.25 circle inverts the curve at its own t', () => {
    const { getByTestId, onEdgeBend } = renderEdge()
    const grab = getByTestId('edge-grab-e1-0.25')
    fireEvent.pointerDown(grab, { pointerId: 4, clientX: 0, clientY: 0 })
    // C=(90,−20) → offset (20,−10): P chosen so the per-t inverse is exact
    fireEvent.pointerMove(grab, { pointerId: 4, clientX: 40, clientY: -7.5 })
    fireEvent.pointerUp(grab, { pointerId: 4, clientX: 40, clientY: -7.5 })
    expect(onEdgeBend).toHaveBeenCalledWith('e1', { dx: 20, dy: -10 })
  })

  it('double-click on the edge resets the bend', () => {
    const { container, onEdgeBend } = renderEdge({ data: { bend: { dx: 5, dy: 5 } } })
    const interaction = container.querySelector('.react-flow__edge-interaction') as SVGPathElement
    expect(interaction).not.toBeNull()
    fireEvent.doubleClick(interaction)
    expect(onEdgeBend).toHaveBeenCalledWith('e1', null)
  })

  it('data.readOnly renders no grab circles and no dblclick target', () => {
    const { container } = renderEdge({ data: { readOnly: true } })
    expect(container.querySelectorAll('.edge-grab')).toHaveLength(0)
    expect(container.querySelector('.react-flow__edge-interaction')).toBeNull()
  })
})
