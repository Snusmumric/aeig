import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TypedNode } from './TypedNode'

const nodeTypes = { typed: TypedNode }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange?: (changes: NodeChange[]) => void
}

export function GraphCanvas({ nodes, edges, onNodesChange }: GraphCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
