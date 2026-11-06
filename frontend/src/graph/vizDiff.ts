import type { GraphEdge, GraphNode, ManifestEdge, ManifestNode, Visualization } from '../api/types'

export type VizDiffMode = 'unbound' | 'legacy' | 'bound'

export interface VizDiff {
  mode: VizDiffMode
  manifestNodes: Record<string, ManifestNode>
  manifestEdges: Record<string, ManifestEdge>
  /** manifest − graph (renderable ghosts; legacy dead position keys incl.) */
  deletedNodes: ManifestNode[]
  deletedEdges: ManifestEdge[]
  /** graph − manifest (highlighted additions) */
  addedNodeIds: Set<string>
  addedEdgeIds: Set<string>
}

function labelOf(n: GraphNode): string {
  const label = n.properties['label']
  return typeof label === 'string' ? label : n.id
}

/**
 * Diff the loaded visualization's remembered element set against the current
 * graph. Three load modes (spec "Frontend"):
 *  - bound   — viz.nodes present: plain diff manifest ↔ graph;
 *  - legacy  — manifests NULL but positions non-empty (pre-manifest rows):
 *              manifest := graph nodes having a saved position entry (adopted
 *              with type/label); dead position keys become ghost entries
 *              {type:'ghost', label:id} at their saved coords; manifest edges
 *              := current edges (legacy rows never tracked edges);
 *  - unbound — no manifest, no positions (fresh default): empty diff.
 */
export function computeVizDiff(
  viz: Visualization | null,
  nodes: GraphNode[],
  edges: GraphEdge[],
): VizDiff {
  let mode: VizDiffMode
  let manifestNodes: Record<string, ManifestNode>
  let manifestEdges: Record<string, ManifestEdge>

  if (viz && viz.nodes != null) {
    mode = 'bound'
    manifestNodes = viz.nodes
    manifestEdges = viz.edges ?? {}
  } else if (viz && Object.keys(viz.positions).length > 0) {
    mode = 'legacy'
    const byId = new Map(nodes.map((n) => [n.id, n]))
    manifestNodes = {}
    for (const [id, pos] of Object.entries(viz.positions)) {
      const n = byId.get(id)
      manifestNodes[id] = n
        ? { type: n.type, label: labelOf(n), x: pos.x, y: pos.y }
        : { type: 'ghost', label: id, x: pos.x, y: pos.y }
    }
    manifestEdges = Object.fromEntries(
      edges.map((e) => [e.id, { type: e.type, source: e.source, target: e.target }]),
    )
  } else {
    // unbound: the row has no element memory (fresh default) — nothing is
    // added, nothing deleted, nothing hidden
    return {
      mode: 'unbound',
      manifestNodes: {},
      manifestEdges: {},
      deletedNodes: [],
      deletedEdges: [],
      addedNodeIds: new Set(),
      addedEdgeIds: new Set(),
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edgeIds = new Set(edges.map((e) => e.id))
  const deletedNodes: ManifestNode[] = []
  for (const [id, m] of Object.entries(manifestNodes)) {
    if (!nodeIds.has(id)) deletedNodes.push(m)
  }
  const deletedEdges: ManifestEdge[] = []
  for (const [id, m] of Object.entries(manifestEdges)) {
    if (!edgeIds.has(id)) deletedEdges.push(m)
  }
  const addedNodeIds = new Set(nodes.map((n) => n.id).filter((id) => !(id in manifestNodes)))
  const addedEdgeIds = new Set(edges.map((e) => e.id).filter((id) => !(id in manifestEdges)))

  return { mode, manifestNodes, manifestEdges, deletedNodes, deletedEdges, addedNodeIds, addedEdgeIds }
}
