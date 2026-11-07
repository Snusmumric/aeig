/**
 * Pure edge-geometry math shared by the dynamic-anchor and bend features.
 *
 * Through-point semantics (binding): the persisted `{dx, dy}` is the
 * displacement of the point the curve passes through — `curve(0.5) =
 * straightMid + offset` — so the Bézier control point is `C = M + 2·offset`
 * (factor 2!), and dragging inverts the quadratic at the grabbed parameter.
 */

export type Side = 't' | 'r' | 'b' | 'l'

export interface Pt {
  x: number
  y: number
}

export interface Bend {
  dx: number
  dy: number
}

/** Estimated node center offset (half of a ~100×50 node) — nodes are
 *  similar-sized; the approximation is accepted and documented in the spec. */
export const EST_CENTER: Pt = { x: 50, y: 25 }

/**
 * Pick the handle pair from the direction between (estimated) node centers:
 * `|dx| ≥ |dy|` → horizontal sides (exit toward the neighbor, entry facing
 * back), else vertical. Coincident points → horizontal default.
 */
export function pickHandles(p1: Pt, p2: Pt): { source: Side; target: Side } {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'r', target: 'l' } : { source: 'l', target: 'r' }
  }
  return dy >= 0 ? { source: 'b', target: 't' } : { source: 't', target: 'b' }
}

/** Control point of the quadratic through `mid + off`: `C = M + 2·off`. */
export function quadControl(s: Pt, e: Pt, off: Bend): Pt {
  return {
    x: (s.x + e.x) / 2 + 2 * off.dx,
    y: (s.y + e.y) / 2 + 2 * off.dy,
  }
}

/** Point on the quadratic Bézier `s → c → e` at parameter `u`. */
export function quadPoint(s: Pt, c: Pt, e: Pt, u: number): Pt {
  const v = 1 - u
  return {
    x: v * v * s.x + 2 * u * v * c.x + u * u * e.x,
    y: v * v * s.y + 2 * u * v * c.y + u * u * e.y,
  }
}

/**
 * Inverse of the curve at parameter `u` for a pointer at flow position `p`:
 * `C = (P − (1−u)²·S − u²·E) / (2u(1−u))`, `offset = (C − M)/2`.
 * At u = 0.5 this reduces to `offset = P − M`.
 */
export function bendFromPointer(s: Pt, e: Pt, u: number, p: Pt): Bend {
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }
  if (u === 0.5) {
    return { dx: p.x - mid.x, dy: p.y - mid.y }
  }
  const v = 1 - u
  const w = 2 * u * v
  const c = {
    x: (p.x - v * v * s.x - u * u * e.x) / w,
    y: (p.y - v * v * s.y - u * u * e.y) / w,
  }
  return { dx: (c.x - mid.x) / 2, dy: (c.y - mid.y) / 2 }
}
