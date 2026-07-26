import type { Node } from '@xyflow/react'

export function extractPositions(nodes: Node[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    out[n.id] = { x: n.position.x, y: n.position.y }
  }
  return out
}
