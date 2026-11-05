import { describe, it, expect } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { FOLLOW_FACTOR, FOLLOW_MAX_RING, planFollowers, applyFollowDrag } from './followDrag'

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} })
const edge = (id: string, source: string, target: string): Edge => ({ id, source, target })

describe('planFollowers', () => {
  it('assigns BFS rings undirected from the dragged node', () => {
    // a(root) - b - c - d - e  plus  a - e (cycle back)
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(node)
    const edges = [
      edge('e1', 'a', 'b'),
      edge('e2', 'b', 'c'),
      edge('e3', 'c', 'd'),
      edge('e4', 'd', 'e'),
      edge('e5', 'e', 'a'),
    ]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.get('e')).toBe(1) // direct via e5, despite 4-hop path the other way
    expect(plan.get('c')).toBe(2)
    expect(plan.get('d')).toBe(2) // a-e-d is 2 hops — minimal ring wins
    expect(plan.has('a')).toBe(false)
  })

  it('chain of 5 caps at ring 3: ring-4 node gets no entry', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(node)
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd'), edge('e4', 'd', 'e')]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.get('c')).toBe(2)
    expect(plan.get('d')).toBe(3)
    expect(plan.has('e')).toBe(false) // ring 4 — beyond FOLLOW_MAX_RING
    expect(FOLLOW_MAX_RING).toBe(3)
    expect(FOLLOW_FACTOR).toBe(0.5)
  })

  it('edges to unknown endpoints are ignored', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.size).toBe(1)
  })

  it('no visible edges touching the node yields an empty plan', () => {
    const plan = planFollowers([node('a'), node('b')], [edge('e1', 'b', 'c')], 'a')
    expect(plan.size).toBe(0)
  })
})

describe('applyFollowDrag', () => {
  const starts = { f1: { x: 100, y: 200 }, f2: { x: 0, y: 0 }, f3: { x: -10, y: 10 } }
  const plan = new Map([
    ['f1', 1],
    ['f2', 2],
    ['f3', 3],
  ])

  it('displaces each follower by delta × 0.5^ring', () => {
    const out = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    expect(out.f1).toEqual({ x: 100 + 40, y: 200 + 20 }) // ½
    expect(out.f2).toEqual({ x: 0 + 20, y: 0 + 10 }) // ¼
    expect(out.f3).toEqual({ x: -10 + 10, y: 10 + 5 }) // ⅛
  })

  it('is idempotent: same inputs, same outputs (no accumulation)', () => {
    const once = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    const twice = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    expect(once).toEqual(twice)
    expect(starts.f2).toEqual({ x: 0, y: 0 }) // inputs not mutated
  })

  it('returns entries only for planned followers', () => {
    const out = applyFollowDrag({ ...starts, other: { x: 1, y: 1 } }, plan, { x: 0, y: 0 })
    expect(Object.keys(out).sort()).toEqual(['f1', 'f2', 'f3'])
  })
})
