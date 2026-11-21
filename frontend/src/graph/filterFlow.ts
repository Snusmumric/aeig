import type { Edge, Node } from '@xyflow/react'
import type { TypedEdgeData, TypedNodeData } from './toFlow'

export function filterFlow(
  allNodes: Node<TypedNodeData>[],
  allEdges: Edge<TypedEdgeData>[],
  visibleTypes: Set<string> | null,
  visibleEdgeTypes: Set<string> | null = null,
  hideOrphans = false,
  visibleSlices: Set<string> | null = null,
): { nodes: Node<TypedNodeData>[]; edges: Edge<TypedEdgeData>[] } {
  if (!visibleTypes && !visibleEdgeTypes && !hideOrphans && !visibleSlices) return { nodes: allNodes, edges: allEdges }
  let nodes = visibleTypes ? allNodes.filter((n) => visibleTypes.has(n.data.nodeType)) : allNodes
  if (visibleSlices) {
    // slice filter: a member is hidden only when NONE of its slices is checked
    // (a node in two slices stays visible while either is); membership-free
    // nodes are always visible — mirroring visibleTypes semantics
    nodes = nodes.filter((n) => {
      const sids = n.data.sliceIds
      if (!sids || sids.length === 0) return true
      return sids.some((sid) => visibleSlices.has(sid))
    })
  }
  const visible = new Set(nodes.map((n) => n.id))
  let edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
  if (visibleEdgeTypes) edges = edges.filter((e) => e.data !== undefined && visibleEdgeTypes.has(e.data.edgeType))
  if (hideOrphans) {
    const connected = new Set(edges.flatMap((e) => [e.source, e.target]))
    return { nodes: nodes.filter((n) => connected.has(n.id)), edges }
  }
  return { nodes, edges }
}
