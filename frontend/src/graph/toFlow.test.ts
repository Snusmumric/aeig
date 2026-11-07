import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges } from './toFlow'
import type { TypeStyleMap } from './typeStyle'
import type { Subgraph } from '../api/types'

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  depends_on: { shape: 'rectangle', color: '#cc3366' },
}

const sg: Subgraph = {
  nodes: [
    { id: 'n1', type: 'Task', properties: { label: 'First' } },
    { id: 'n2', type: 'Unknown', properties: {} },
  ],
  edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }],
}

describe('toFlow', () => {
  it('maps nodes with type, style, and label', () => {
    const nodes = toFlowNodes(sg, styles)
    expect(nodes[0]).toMatchObject({
      id: 'n1',
      type: 'typed',
      data: { label: 'First', nodeType: 'Task', style: { shape: 'rectangle', color: '#3366cc' } },
    })
    // label falls back to id, style falls back to default for unknown type
    expect(nodes[1].data.label).toBe('n2')
    expect(nodes[1].data.style.color).toBe('#8899aa')
  })

  it('uses provided positions over the grid fallback', () => {
    const nodes = toFlowNodes(sg, styles, { n1: { x: 42, y: 99 } })
    expect(nodes[0].position).toEqual({ x: 42, y: 99 })
    expect(nodes[1].position).toEqual({ x: 200, y: 0 }) // grid fallback for index 1
  })

  it('maps edges with label and stroke color', () => {
    const edges = toFlowEdges(sg, styles)
    expect(edges[0]).toMatchObject({ id: 'e1', source: 'n1', target: 'n2', label: 'depends_on' })
    expect(edges[0].style?.stroke).toBe('#cc3366')
    expect(edges[0].data).toEqual({ edgeType: 'depends_on' })
  })

  it('directed edge types get a closed arrowhead marker', () => {
    const directedStyles: TypeStyleMap = { depends_on: { shape: 'rectangle', color: '#cc3366', directed: true } }
    const edges = toFlowEdges(sg, directedStyles)
    expect(edges[0].markerEnd).toMatchObject({ type: 'arrowclosed' })
  })

  it('undirected and unstyled edge types render without a marker', () => {
    const edges = toFlowEdges(sg, styles) // depends_on styled without `directed`
    expect(edges[0].markerEnd).toBeUndefined()
    const unstyled = toFlowEdges(sg, {})
    expect(unstyled[0].markerEnd).toBeUndefined()
  })
})
