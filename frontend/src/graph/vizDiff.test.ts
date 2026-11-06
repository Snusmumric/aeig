import { describe, it, expect } from 'vitest'
import { computeVizDiff } from './vizDiff'
import type { GraphEdge, GraphNode, ManifestEdge, ManifestNode, Visualization } from '../api/types'

function viz(overrides: Partial<Visualization> = {}): Visualization {
  return {
    id: 'v1',
    graphId: 'g1',
    name: 'default',
    positions: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    edgeTypes: null,
    hideOrphans: false,
    createdAt: '',
    graphVersion: 0,
    ...overrides,
  }
}

function node(id: string, type = 'Task', label?: string): GraphNode {
  return { id, type, properties: label ? { label } : {} }
}

function edge(id: string, source: string, target: string, type = 'depends_on'): GraphEdge {
  return { id, type, source, target, properties: {} }
}

const mn = (type: string, label: string, x: number, y: number): ManifestNode => ({ type, label, x, y })
const me = (type: string, source: string, target: string): ManifestEdge => ({ type, source, target })

describe('computeVizDiff — unbound', () => {
  it('fresh viz (no manifest, no positions) → empty diff, mode unbound', () => {
    const d = computeVizDiff(viz(), [node('n1'), node('n2')], [edge('e1', 'n1', 'n2')])
    expect(d.mode).toBe('unbound')
    expect(d.manifestNodes).toEqual({})
    expect(d.manifestEdges).toEqual({})
    expect(d.deletedNodes).toEqual([])
    expect(d.deletedEdges).toEqual([])
    expect(d.addedNodeIds).toEqual(new Set())
    expect(d.addedEdgeIds).toEqual(new Set())
  })

  it('null viz → unbound, empty diff', () => {
    const d = computeVizDiff(null, [node('n1')], [])
    expect(d.mode).toBe('unbound')
    expect(d.addedNodeIds.size).toBe(0)
  })

  it('explicitly null manifests with non-empty positions are NOT unbound (legacy)', () => {
    const d = computeVizDiff(viz({ nodes: null, edges: null, positions: { n1: { x: 1, y: 2 } } }), [node('n1')], [])
    expect(d.mode).toBe('legacy')
  })
})

describe('computeVizDiff — legacy (positions-only rows, the …0003 shape)', () => {
  // 3 saved positions vs 5 graph nodes — the acceptance scenario in miniature
  const legacyViz = viz({
    positions: {
      n1: { x: 10, y: 11 },
      n2: { x: 20, y: 21 },
      n3: { x: 30, y: 31 },
    },
  })
  const nodes = [node('n1', 'Task', 'T1'), node('n2', 'Milestone', 'T2'), node('n3', 'Task'), node('n4'), node('n5')]
  const edges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3')]

  it('manifest := nodes with a saved position → 3 manifest, 2 added, 0 deleted', () => {
    const d = computeVizDiff(legacyViz, nodes, edges)
    expect(d.mode).toBe('legacy')
    expect(Object.keys(d.manifestNodes).sort()).toEqual(['n1', 'n2', 'n3'])
    expect(d.manifestNodes['n1']).toEqual(mn('Task', 'T1', 10, 11))
    expect(d.manifestNodes['n2']).toEqual(mn('Milestone', 'T2', 20, 21))
    // label falls back to the node id when the property is absent
    expect(d.manifestNodes['n3']).toEqual(mn('Task', 'n3', 30, 31))
    expect(d.addedNodeIds).toEqual(new Set(['n4', 'n5']))
    expect(d.deletedNodes).toEqual([])
  })

  it('dead position key (no live node) → ghost in deletedNodes at the saved coords', () => {
    const stale = viz({ positions: { n1: { x: 1, y: 2 }, dead: { x: 40, y: 41 } } })
    const d = computeVizDiff(stale, [node('n1')], [])
    expect(d.mode).toBe('legacy')
    expect(d.deletedNodes).toEqual([mn('ghost', 'dead', 40, 41)])
    // the live node with a position is not deleted
    expect(d.addedNodeIds).toEqual(new Set())
  })

  it('legacy manifest edges := current edges → never any edge diff', () => {
    const d = computeVizDiff(legacyViz, nodes, edges)
    expect(d.manifestEdges).toEqual({ e1: me('depends_on', 'n1', 'n2'), e2: me('depends_on', 'n2', 'n3') })
    expect(d.deletedEdges).toEqual([])
    expect(d.addedEdgeIds).toEqual(new Set())
  })
})

describe('computeVizDiff — bound (manifest present)', () => {
  const boundViz = viz({
    graphVersion: 7,
    nodes: {
      n1: mn('Task', 'T1', 1, 2),
      n2: mn('Milestone', 'T2', 3, 4),
      gone: mn('Task', 'Gone', 9, 9),
    },
    edges: {
      e1: me('depends_on', 'n1', 'n2'),
      eGone: me('blocks', 'n1', 'gone'),
    },
  })
  const nodes = [node('n1', 'Task', 'T1'), node('n2', 'Milestone', 'T2'), node('n4')]
  const edges = [edge('e1', 'n1', 'n2'), edge('eNew', 'n1', 'n4', 'blocks')]

  it('plain diff — node and edge diffs both ways', () => {
    const d = computeVizDiff(boundViz, nodes, edges)
    expect(d.mode).toBe('bound')
    expect(d.manifestNodes).toEqual(boundViz.nodes)
    expect(d.manifestEdges).toEqual(boundViz.edges)
    expect(d.deletedNodes).toEqual([mn('Task', 'Gone', 9, 9)])
    expect(d.deletedEdges).toEqual([me('blocks', 'n1', 'gone')])
    expect(d.addedNodeIds).toEqual(new Set(['n4']))
    expect(d.addedEdgeIds).toEqual(new Set(['eNew']))
  })

  it('graph nodes with saved positions but absent from the manifest are added', () => {
    // positions alone never imply membership once the row is bound
    const stale = viz({
      graphVersion: 3,
      nodes: { n1: mn('Task', 'T1', 1, 2) },
      edges: {},
      positions: { n1: { x: 1, y: 2 }, n2: { x: 5, y: 5 } },
    })
    const d = computeVizDiff(stale, [node('n1'), node('n2')], [])
    expect(d.mode).toBe('bound')
    expect(d.addedNodeIds).toEqual(new Set(['n2']))
    expect(d.deletedNodes).toEqual([])
  })

  it('manifest equal to the graph → empty diff', () => {
    const same = viz({
      graphVersion: 5,
      nodes: { n1: mn('Task', 'T1', 1, 2), n2: mn('Milestone', 'T2', 3, 4) },
      edges: { e1: me('depends_on', 'n1', 'n2') },
    })
    const d = computeVizDiff(same, [node('n1', 'Task', 'T1'), node('n2', 'Milestone', 'T2')], [edge('e1', 'n1', 'n2')])
    expect(d.deletedNodes).toEqual([])
    expect(d.deletedEdges).toEqual([])
    expect(d.addedNodeIds.size).toBe(0)
    expect(d.addedEdgeIds.size).toBe(0)
  })
})
