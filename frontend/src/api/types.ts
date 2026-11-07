import type { Bend } from '../graph/edgeGeometry'

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

/** Manifest entry for a remembered node — label/type/geometry only. */
export interface ManifestNode {
  type: string
  label: string
  x: number
  y: number
}

/** Manifest entry for a remembered edge. */
export interface ManifestEdge {
  type: string
  source: string
  target: string
}

/**
 * Binding of a visualization to the graph state at its last explicit sync.
 * Carried inside the saveVisualization opts bag — included in the PUT body
 * only when provided (absent fields keep their stored values server-side).
 */
export interface VisualizationManifest {
  graphVersion: number
  nodes: Record<string, ManifestNode>
  edges: Record<string, ManifestEdge>
}

/**
 * Optional save payload extensions — included in the PUT body only when
 * provided (absent fields keep their stored values server-side).
 */
export interface SaveVisualizationOptions {
  /** binding refresh — ONLY via sync; autosave/plain saves omit it */
  manifest?: VisualizationManifest
  /** edge bends keyed by edgeId — present = full replace of the map */
  bends?: Record<string, Bend>
}

export interface Visualization {
  id: string
  graphId: string
  name: string
  positions: Record<string, Position>
  viewport: Viewport
  nodeTypes?: string[]
  edgeTypes?: string[] | null
  hideOrphans: boolean
  isDefault?: boolean
  createdAt: string
  /** Graph version at the moment of the last explicit sync (0 = unbound). */
  graphVersion: number
  /** Element-set manifest — null = legacy/unbound row (never synced). */
  nodes?: Record<string, ManifestNode> | null
  edges?: Record<string, ManifestEdge> | null
  /** Edge bends {edgeId → {dx,dy}} — null = never saved. */
  bends?: Record<string, Bend> | null
}
