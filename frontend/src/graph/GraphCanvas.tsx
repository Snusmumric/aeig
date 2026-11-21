import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  type Node,
  type Edge,
  type NodeChange,
  type NodeProps,
  type OnNodeDrag,
  type OnMove,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type EdgeChange,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '../App.css'
import { CurvyEdge, EdgeBendContext } from './CurvyEdge'
import { SIDES, TypedNode } from './TypedNode'
import type { Bend } from './edgeGeometry'

/** Read-only ghost of a node remembered by the visualization but gone from
 *  the graph — styled by `.react-flow__node.ghost` in App.css. Carries the
 *  same 8 near-invisible anchors so ghost edges can be side-anchored too. */
function GhostNode(props: NodeProps) {
  const data = props.data as { label: string }
  return (
    <div data-testid="ghost-node" style={{ padding: 10, minWidth: 80, textAlign: 'center', background: '#6b7280', color: '#fff', borderRadius: 4, border: '1px dashed #ef4444' }}>
      {SIDES.map((side) => (
        <Handle key={`target-${side.id}`} type="target" position={side.position} id={side.id} className="anchor" isConnectable={false} />
      ))}
      <div>{data.label}</div>
      {SIDES.map((side) => (
        <Handle key={`source-${side.id}`} type="source" position={side.position} id={side.id} className="anchor" isConnectable={false} />
      ))}
    </div>
  )
}

const nodeTypes = { typed: TypedNode, ghost: GhostNode }
const edgeTypes = { curvy: CurvyEdge }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange?: (changes: NodeChange[]) => void
  onEdgesChange?: (changes: EdgeChange[]) => void
  onNodeDragStart?: OnNodeDrag
  onNodeDrag?: OnNodeDrag
  onNodeDragStop?: OnNodeDrag
  /** Viewport of the loaded visualization — applied once, right after ReactFlow init. */
  applyViewport?: Viewport
  /** Notified on every pan/zoom so the editor can track the current viewport. */
  onMove?: (vp: Viewport) => void
  /** Notified when a curvy edge is bent (grab-circle drag) or reset (dblclick). */
  onEdgeBend?: (edgeId: string, bend: Bend | null) => void
  /** Right-click on a node — opens the slice membership menu. */
  onNodeContextMenu?: NodeMouseHandler<Node>
  /** Right-click on an edge — opens the slice menu (adds both endpoints). */
  onEdgeContextMenu?: EdgeMouseHandler<Edge>
  fitView?: boolean
}

export function GraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  applyViewport,
  onMove,
  onEdgeBend,
  onNodeContextMenu,
  onEdgeContextMenu,
  fitView = true,
}: GraphCanvasProps) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const appliedRef = useRef(false)
  const suppressMove = useRef(false)
  useEffect(() => {
    // The visualization loads asynchronously, so `applyViewport` usually arrives
    // after onInit already fired — re-run whenever either becomes available,
    // apply once, before any user interaction could have moved the pane.
    if (!applyViewport || !instance || appliedRef.current) return
    appliedRef.current = true
    // setViewport() runs a programmatic d3-zoom transform which ReactFlow echoes
    // through onMove (sourceEvent=null) — suppress that echo until it settles:
    // it is not user interaction and must not dirty the editor's autosave state.
    suppressMove.current = true
    void instance
      .setViewport(applyViewport)
      .catch(() => undefined)
      .finally(() => {
        suppressMove.current = false
      })
  }, [applyViewport, instance])

  const handleFlowMove: OnMove = (_event, vp) => {
    if (suppressMove.current) return
    onMove?.(vp)
  }
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <EdgeBendContext.Provider value={{ onEdgeBend }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          // Space+drag draws the selection box; plain drag keeps panning
          // (pan is the high-frequency action). panActivationKeyCode is cleared
          // so Space does not double as a key-held pan mode.
          selectionKeyCode="Space"
          panActivationKeyCode={null}
          multiSelectionKeyCode={['Control', 'Meta']}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={setInstance}
          onMove={onMove ? handleFlowMove : undefined}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          fitView={fitView}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </EdgeBendContext.Provider>
    </div>
  )
}
