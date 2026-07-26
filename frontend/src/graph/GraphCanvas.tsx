import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TypedNode } from './TypedNode'

const nodeTypes = { typed: TypedNode }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
}

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
