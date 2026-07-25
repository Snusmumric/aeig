import type { Node, Edge } from '@xyflow/react'
import type { Subgraph } from '../api/types'
import { resolveStyle, type TypeStyle, type TypeStyleMap } from './typeStyle'

export interface TypedNodeData {
  label: string
  nodeType: string
  style: TypeStyle
  properties: Record<string, unknown>
  [key: string]: unknown
}

const GRID_COLS = 5
const GRID_DX = 200
const GRID_DY = 150

export function toFlowNodes(
  sg: Subgraph,
  styles: TypeStyleMap,
  positions?: Record<string, { x: number; y: number }>,
): Node<TypedNodeData>[] {
  return sg.nodes.map((n, i) => ({
    id: n.id,
    type: 'typed',
    position:
      positions?.[n.id] ?? {
        x: (i % GRID_COLS) * GRID_DX,
        y: Math.floor(i / GRID_COLS) * GRID_DY,
      },
    data: {
      label: (n.properties['label'] as string) ?? n.id,
      nodeType: n.type,
      style: resolveStyle(styles, n.type),
      properties: n.properties,
    },
  }))
}

export function toFlowEdges(sg: Subgraph, styles: TypeStyleMap): Edge[] {
  return sg.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.type,
    style: { stroke: resolveStyle(styles, e.type).color },
  }))
}
