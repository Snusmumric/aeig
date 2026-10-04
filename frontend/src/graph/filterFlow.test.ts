import { describe, it, expect } from 'vitest'
import { filterFlow } from './filterFlow'
import type { Edge, Node } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

function node(id: string, nodeType: string): Node<TypedNodeData> {
  return {
    id,
    type: 'typed',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, style: { shape: 'rectangle', color: '#000' }, properties: {} },
  }
}

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target })

const allNodes = [node('n1', 'service'), node('n2', 'domain'), node('n3', 'domain')]
const allEdges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n1', 'n3')]

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
})
