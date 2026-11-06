import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
  type OnMove,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TypedNode } from './TypedNode'

const nodeTypes = { typed: TypedNode }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange?: (changes: NodeChange[]) => void
  onNodeDragStart?: OnNodeDrag
  onNodeDrag?: OnNodeDrag
  onNodeDragStop?: OnNodeDrag
  /** Viewport of the loaded visualization — applied once, right after ReactFlow init. */
  applyViewport?: Viewport
  /** Notified on every pan/zoom so the editor can track the current viewport. */
  onMove?: (vp: Viewport) => void
  fitView?: boolean
}

export function GraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  applyViewport,
  onMove,
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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        selectionKeyCode={null}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onMove={onMove ? handleFlowMove : undefined}
        fitView={fitView}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
