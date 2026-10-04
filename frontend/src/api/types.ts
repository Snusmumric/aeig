export interface Graph {
  id: string
  name: string
  version: number
  createdAt: string
}

export interface GraphNode {
  id: string
  type: string
  properties: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  type: string
  source: string
  target: string
  properties: Record<string, unknown>
}

export interface Subgraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Mutations {
  upsertNodes?: GraphNode[]
  upsertEdges?: GraphEdge[]
  deleteNodeIds?: string[]
  deleteEdgeIds?: string[]
}

export interface Position {
  x: number
  y: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Layout {
  id: string
  graphId: string
  name: string
  positions: Record<string, Position>
  viewport: Viewport
  nodeTypes?: string[]
  createdAt: string
}
