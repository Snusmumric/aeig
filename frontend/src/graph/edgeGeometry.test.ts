import { describe, it, expect } from 'vitest'
import {
  EST_CENTER,
  bendFromPointer,
  pickHandles,
  quadControl,
  quadPoint,
  type Pt,
} from './edgeGeometry'

describe('pickHandles', () => {
  it('picks horizontal sides when the target is right of the source', () => {
    expect(pickHandles({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({ source: 'r', target: 'l' })
  })

  it('picks horizontal sides when the target is left of the source', () => {
    expect(pickHandles({ x: 0, y: 0 }, { x: -100, y: 0 })).toEqual({ source: 'l', target: 'r' })
  })

  it('picks vertical sides when the target is below the source', () => {
    expect(pickHandles({ x: 0, y: 0 }, { x: 0, y: 100 })).toEqual({ source: 'b', target: 't' })
  })

  it('picks vertical sides when the target is above the source', () => {
    expect(pickHandles({ x: 0, y: 0 }, { x: 0, y: -100 })).toEqual({ source: 't', target: 'b' })
  })

  it('diagonal boundary |dx| == |dy| resolves to horizontal', () => {
    expect(pickHandles({ x: 0, y: 0 }, { x: 50, y: 50 })).toEqual({ source: 'r', target: 'l' })
    expect(pickHandles({ x: 0, y: 0 }, { x: -50, y: 50 })).toEqual({ source: 'l', target: 'r' })
    expect(pickHandles({ x: 0, y: 0 }, { x: 50, y: -50 })).toEqual({ source: 'r', target: 'l' })
  })

  it('coincident points fall back to the horizontal default', () => {
    expect(pickHandles({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ source: 'r', target: 'l' })
  })

  it('self-loop input (same point twice) is the coincident case', () => {
    expect(pickHandles({ x: 7, y: 9 }, { x: 7, y: 9 })).toEqual({ source: 'r', target: 'l' })
  })

  it('works on node-position inputs shifted by the estimated center', () => {
    // n1 at (0,0), n2 at (0,200): centers (50,25) and (50,225) → vertical
    const c1: Pt = { x: 0 + EST_CENTER.x, y: 0 + EST_CENTER.y }
    const c2: Pt = { x: 0 + EST_CENTER.x, y: 200 + EST_CENTER.y }
    expect(pickHandles(c1, c2)).toEqual({ source: 'b', target: 't' })
  })
})

describe('quadControl / quadPoint', () => {
  const s: Pt = { x: 0, y: 0 }
  const e: Pt = { x: 100, y: 50 }

  it('control point is the midpoint displaced by twice the offset', () => {
    expect(quadControl(s, e, { dx: 20, dy: -10 })).toEqual({ x: 90, y: 5 }) // mid (50,25) + 2·off
  })

  it('curve at u=0.5 passes through mid + offset (factor-2 through-point)', () => {
    const off = { dx: 20, dy: -10 }
    const c = quadControl(s, e, off)
    expect(quadPoint(s, c, e, 0.5)).toEqual({ x: 50 + off.dx, y: 25 + off.dy })
  })

  it('curve endpoints at u=0 and u=1 are s and e', () => {
    const c = quadControl(s, e, { dx: 20, dy: -10 })
    expect(quadPoint(s, c, e, 0)).toEqual(s)
    expect(quadPoint(s, c, e, 1)).toEqual(e)
  })

  it('zero offset keeps the curve the straight segment', () => {
    const c = quadControl(s, e, { dx: 0, dy: 0 })
    expect(quadPoint(s, c, e, 0.5)).toEqual({ x: 50, y: 25 })
  })
})

describe('bendFromPointer (per-t inverse)', () => {
  const s: Pt = { x: 0, y: 0 }
  const e: Pt = { x: 100, y: 50 }
  const off = { dx: 20, dy: -10 }
  const c = quadControl(s, e, off)

  it.each([0.25, 0.5, 0.75])(
    'pointer placed on the curve at u=%s reproduces the offset',
    (u) => {
      const pointer = quadPoint(s, c, e, u)
      expect(bendFromPointer(s, e, u, pointer)).toEqual(off)
    },
  )

  it('u=0.5 is the shortcut offset = pointer − mid', () => {
    const mid = { x: 50, y: 25 }
    expect(bendFromPointer(s, e, 0.5, { x: mid.x + 7, y: mid.y - 3 })).toEqual({ dx: 7, dy: -3 })
  })
})
