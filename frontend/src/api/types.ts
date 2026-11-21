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
  /** slice memberships (system field, absent when the node is in no slice) */
  sliceIds?: string[]
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
  /** visible slice UUIDs — present = full replace ([] = show none, null = clear → «Все») */
  visibleSlices?: string[] | null
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
  /** Visible slice UUIDs — null = no slice filter (all visible). */
  visibleSlices?: string[] | null
}

/** Slice identity row — as listed/created/renamed over the API. */
export interface Slice {
  id: string
  name: string
  description: string
  nodeCount: number
}

/** Slice detail — GET /graphs/{id}/slices/{name}, members hydrated. */
export interface SliceDetail extends Slice {
  nodes: GraphNode[]
}
