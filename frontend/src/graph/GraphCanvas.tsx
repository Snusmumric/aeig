import { useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
  type OnNodeDrag,
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
  const instanceRef = useRef<ReactFlowInstance | null>(null)
  const appliedRef = useRef(false)
  useEffect(() => {
    // The visualization loads asynchronously, so `applyViewport` usually arrives
    // after onInit already fired — apply it once, as soon as both are available
    // (and before any user interaction could have moved the pane).
    if (applyViewport && instanceRef.current && !appliedRef.current) {
      appliedRef.current = true
      void instanceRef.current.setViewport(applyViewport)
    }
  }, [applyViewport])
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
        onInit={(instance) => {
          instanceRef.current = instance
        }}
        onMove={onMove ? (_event, vp) => onMove(vp) : undefined}
        fitView={fitView}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
