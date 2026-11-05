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
