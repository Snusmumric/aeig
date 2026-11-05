import type { Edge, Node } from '@xyflow/react'

export const FOLLOW_MAX_RING = 3
export const FOLLOW_FACTOR = 0.5

/**
 * Plan which nodes follow a shift-drag: undirected BFS from `draggedId` over
 * edges whose both endpoints are in `visibleNodes`, capped at FOLLOW_MAX_RING.
 * Returns follower id → ring (1..FOLLOW_MAX_RING); the dragged node is never included.
 */
export function planFollowers(
  visibleNodes: Node[],
  visibleEdges: Edge[],
  draggedId: string,
): Map<string, number> {
  const plan = new Map<string, number>()
  const visible = new Set(visibleNodes.map((n) => n.id))
  if (!visible.has(draggedId)) return plan

  const adjacency = new Map<string, string[]>()
  for (const e of visibleEdges) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue
    addAdjacent(adjacency, e.source, e.target)
    addAdjacent(adjacency, e.target, e.source)
  }

  let frontier = [draggedId]
  for (let ring = 1; ring <= FOLLOW_MAX_RING; ring++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (neighbor === draggedId || plan.has(neighbor)) continue
        plan.set(neighbor, ring)
        next.push(neighbor)
      }
    }
    frontier = next
  }
  return plan
}

function addAdjacent(adjacency: Map<string, string[]>, from: string, to: string): void {
  const list = adjacency.get(from)
  if (list) list.push(to)
  else adjacency.set(from, [to])
}

/**
 * Follower positions for a drag tick: `start + delta × FOLLOW_FACTOR^ring`,
 * computed from the drag-start snapshot (idempotent, inputs not mutated).
 * Returns positions for planned followers only.
 */
export function applyFollowDrag(
  starts: Record<string, { x: number; y: number }>,
  plan: Map<string, number>,
  delta: { x: number; y: number },
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  for (const [id, ring] of plan) {
    const start = starts[id]
    if (!start) continue
    const factor = FOLLOW_FACTOR ** ring
    out[id] = { x: start.x + delta.x * factor, y: start.y + delta.y * factor }
  }
  return out
}
