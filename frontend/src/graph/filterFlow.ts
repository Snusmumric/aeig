import type { Edge, Node } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

export function filterFlow(
  allNodes: Node<TypedNodeData>[],
  allEdges: Edge[],
  visibleTypes: Set<string> | null,
): { nodes: Node<TypedNodeData>[]; edges: Edge[] } {
  if (!visibleTypes) return { nodes: allNodes, edges: allEdges }
  const nodes = allNodes.filter((n) => visibleTypes.has(n.data.nodeType))
  const visible = new Set(nodes.map((n) => n.id))
  const edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
  return { nodes, edges }
}
