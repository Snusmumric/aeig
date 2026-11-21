import { describe, it, expect } from 'vitest'
import { filterFlow } from './filterFlow'
import type { Edge, Node } from '@xyflow/react'
import type { TypedEdgeData, TypedNodeData } from './toFlow'

function node(id: string, nodeType: string): Node<TypedNodeData> {
  return {
    id,
    type: 'typed',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, style: { shape: 'rectangle', color: '#000' }, properties: {} },
  }
}

const edge = (id: string, source: string, target: string, edgeType = 'rel'): Edge<TypedEdgeData> => ({
  id,
  source,
  target,
  data: { edgeType },
})

const allNodes = [node('n1', 'service'), node('n2', 'domain'), node('n3', 'domain')]
const allEdges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n1', 'n3')]

const tEdges = [edge('e1', 'n1', 'n2', 'calls'), edge('e2', 'n2', 'n3', 'owns')]

describe('filterFlow', () => {
  it('null passthrough returns inputs unchanged', () => {
    const out = filterFlow(allNodes, allEdges, null)
    expect(out.nodes).toBe(allNodes)
    expect(out.edges).toBe(allEdges)
  })

  it('keeps nodes of selected types and edges whose both ends are kept', () => {
    const out = filterFlow(allNodes, allEdges, new Set(['domain']))
    expect(out.nodes.map((n) => n.id)).toEqual(['n2', 'n3'])
    expect(out.edges.map((e) => e.id)).toEqual(['e2'])
  })

  it('empty set drops everything', () => {
    const out = filterFlow(allNodes, allEdges, new Set())
    expect(out.nodes).toHaveLength(0)
    expect(out.edges).toHaveLength(0)
  })

  it('filters edges by type while keeping endpoint nodes', () => {
    const out = filterFlow(allNodes, tEdges, null, new Set(['owns']))
    expect(out.edges.map((e) => e.id)).toEqual(['e2'])
    expect(out.nodes).toBe(allNodes)
  })

  it('hideOrphans drops isolated nodes when no type filters are active', () => {
    const nodes = [...allNodes, node('n4', 'service')]
    const out = filterFlow(nodes, tEdges, null, null, true)
    expect(out.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
  })

  it('a hidden edge type turns its endpoint into an orphan under hideOrphans', () => {
    const out = filterFlow(allNodes, tEdges, null, new Set(['calls']), true)
    expect(out.edges.map((e) => e.id)).toEqual(['e1'])
    expect(out.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('all edge types hidden with hideOrphans empties the canvas', () => {
    const out = filterFlow(allNodes, tEdges, null, new Set(), true)
    expect(out.nodes).toHaveLength(0)
    expect(out.edges).toHaveLength(0)
  })
})

describe('filterFlow — slices (Review Focus 3)', () => {
  function snode(id: string, nodeType: string, sliceIds?: string[]): Node<TypedNodeData> {
    return {
      id,
      type: 'typed',
      position: { x: 0, y: 0 },
      data: {
        label: id,
        nodeType,
        style: { shape: 'rectangle', color: '#000' },
        properties: {},
        ...(sliceIds ? { sliceIds } : {}),
      },
    }
  }

  // n1: only s1; n2: s1 AND s2; n3: membership-free
  const snodes = [snode('n1', 'service', ['s1']), snode('n2', 'domain', ['s1', 's2']), snode('n3', 'domain')]
  const sedges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n1', 'n3')]

  it('null visibleSlices = filter inactive, everything passes through', () => {
    const out = filterFlow(snodes, sedges, null, null, false, null)
    expect(out.nodes).toHaveLength(3)
    expect(out.edges).toHaveLength(3)
  })

  it('a two-slice node stays visible while either of its slices is checked', () => {
    const onlyS1 = filterFlow(snodes, sedges, null, null, false, new Set(['s1']))
    expect(onlyS1.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
    const onlyS2 = filterFlow(snodes, sedges, null, null, false, new Set(['s2']))
    // n1 (member of s1 only) is hidden; n2 is visible via s2
    expect(onlyS2.nodes.map((n) => n.id)).toEqual(['n2', 'n3'])
  })

  it('membership-free nodes are always visible, even with nothing checked', () => {
    const out = filterFlow(snodes, sedges, null, null, false, new Set())
    expect(out.nodes.map((n) => n.id)).toEqual(['n3'])
    // and with a non-empty set that excludes their (nonexistent) slices
    const out2 = filterFlow(snodes, sedges, null, null, false, new Set(['s9']))
    expect(out2.nodes.map((n) => n.id)).toEqual(['n3'])
  })

  it('a member is hidden only when none of its slices is checked', () => {
    const out = filterFlow(snodes, sedges, null, null, false, new Set(['s9']))
    expect(out.nodes.map((n) => n.id)).toEqual(['n3'])
    expect(out.edges).toHaveLength(0)
  })

  it('edges follow their endpoints', () => {
    const out = filterFlow(snodes, sedges, null, null, false, new Set(['s2']))
    // n2, n3 visible → only e2 (n2–n3) survives; e1/e3 lose endpoint n1
    expect(out.edges.map((e) => e.id)).toEqual(['e2'])
    const both = filterFlow(snodes, sedges, null, null, false, new Set(['s1', 's2']))
    expect(both.edges.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('composes AND-style with the type filter', () => {
    // type filter alone keeps n2, n3 (domain); the empty slice set then hides
    // n2 (member, nothing checked) while membership-free n3 survives
    const out = filterFlow(snodes, sedges, new Set(['domain']), null, false, new Set())
    expect(out.nodes.map((n) => n.id)).toEqual(['n3'])
    expect(out.edges).toHaveLength(0)
  })
})
