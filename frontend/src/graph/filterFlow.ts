import type { Edge, Node } from '@xyflow/react'
import type { TypedEdgeData, TypedNodeData } from './toFlow'

export function filterFlow(
  allNodes: Node<TypedNodeData>[],
  allEdges: Edge<TypedEdgeData>[],
  visibleTypes: Set<string> | null,
  visibleEdgeTypes: Set<string> | null = null,
  hideOrphans = false,
): { nodes: Node<TypedNodeData>[]; edges: Edge<TypedEdgeData>[] } {
  if (!visibleTypes && !visibleEdgeTypes && !hideOrphans) return { nodes: allNodes, edges: allEdges }
  const nodes = visibleTypes ? allNodes.filter((n) => visibleTypes.has(n.data.nodeType)) : allNodes
  const visible = new Set(nodes.map((n) => n.id))
  let edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
  if (visibleEdgeTypes) edges = edges.filter((e) => e.data !== undefined && visibleEdgeTypes.has(e.data.edgeType))
  if (hideOrphans) {
    const connected = new Set(edges.flatMap((e) => [e.source, e.target]))
    return { nodes: nodes.filter((n) => connected.has(n.id)), edges }
  }
  return { nodes, edges }
}
