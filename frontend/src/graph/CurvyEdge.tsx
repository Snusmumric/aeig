import { createContext, useContext, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { EdgeText, useReactFlow, type EdgeProps } from '@xyflow/react'
import { bendFromPointer, quadControl, quadPoint, type Bend, type Pt } from './edgeGeometry'

/**
 * Bend callbacks for `curvy` edges. ReactFlow passes only EdgeProps to custom
 * edge components, so GraphCanvas injects the editor's handler via context.
 */
export const EdgeBendContext = createContext<{ onEdgeBend?: (edgeId: string, bend: Bend | null) => void }>({})

const GRAB_PARAMETERS = [0.25, 0.5, 0.75] as const

interface CurvyEdgeData {
  /** through-point offset (curve(0.5) = straightMid + bend); unset = straight */
  bend?: Bend
  /** ghost edges render the path but no affordances */
  readOnly?: boolean
}

/**
 * Quadratic Bézier edge with through-point bend semantics: the control point
 * is `C = mid + 2·bend`, so the curve passes through `mid + bend`. Grab
 * circles at u = 0.25/0.5/0.75 drag the offset via the per-t inverse;
 * double-click on the path resets the bend (back to a straight segment).
 */
export function CurvyEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, label, style, data, markerEnd } = props
  const edgeData = (data ?? {}) as CurvyEdgeData
  const { onEdgeBend } = useContext(EdgeBendContext)
  const { screenToFlowPosition } = useReactFlow()

  const s: Pt = { x: sourceX, y: sourceY }
  const e: Pt = { x: targetX, y: targetY }
  const bend = edgeData.bend ?? { dx: 0, dy: 0 }
  const c = quadControl(s, e, bend)
  const mid = quadPoint(s, c, e, 0.5)
  const path = `M ${s.x},${s.y} Q ${c.x},${c.y} ${e.x},${e.y}`

  const dragU = useRef<number | null>(null)

  const startDrag =
    (u: number) =>
    (event: ReactPointerEvent<SVGCircleElement>): void => {
      // keep the canvas pan/zoom out of this drag: stopPropagation skips React
      // layers, and preventDefault suppresses the compatibility mousedown that
      // d3-zoom's native `mousedown.zoom` listener would pan the pane with
      event.preventDefault()
      event.stopPropagation()
      dragU.current = u
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // pointer capture is best-effort (jsdom has no active pointer sessions)
      }
    }

  const dragMove = (event: ReactPointerEvent<SVGCircleElement>): void => {
    const u = dragU.current
    if (u === null) return
    event.stopPropagation()
    const p = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    onEdgeBend?.(id, bendFromPointer(s, e, u, p))
  }

  const endDrag = (event: ReactPointerEvent<SVGCircleElement>): void => {
    if (dragU.current === null) return
    dragU.current = null
    event.stopPropagation()
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // best-effort
    }
  }

  const resetBend = (): void => onEdgeBend?.(id, null)

  return (
    <>
      <path d={path} className="react-flow__edge-path" style={style} fill="none" markerEnd={markerEnd} />
      <EdgeText x={mid.x} y={mid.y} label={label} />
      {!edgeData.readOnly && (
        <>
          <path
            d={path}
            className="react-flow__edge-interaction nopan"
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            onDoubleClick={resetBend}
          />
          {GRAB_PARAMETERS.map((u) => {
            const p = quadPoint(s, c, e, u)
            return (
              <circle
                key={u}
                cx={p.x}
                cy={p.y}
                r={6}
                className="edge-grab nopan"
                data-testid={`edge-grab-${id}-${u}`}
                onPointerDown={startDrag(u)}
                onPointerMove={dragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            )
          })}
        </>
      )}
    </>
  )
}
