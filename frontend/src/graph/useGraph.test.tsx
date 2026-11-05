import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGraph } from './useGraph'
import type { ApiClient } from '../api/client'
import type { TypeStyleMap } from './typeStyle'

const styles: TypeStyleMap = { Task: { shape: 'rectangle', color: '#3366cc' } }

function fakeClient(): ApiClient {
  return {
    getGraph: vi.fn().mockResolvedValue({ id: 'g1', name: 'g', version: 3, createdAt: '' }),
    getSubgraph: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
      ],
      edges: [
        { id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} },
        { id: 'e2', type: 'blocks', source: 'n2', target: 'n3', properties: {} },
      ],
    }),
    createGraph: vi.fn(),
    applyMutations: vi.fn(),
  } as unknown as ApiClient
}

describe('useGraph', () => {
  it('reload seeds nodes/edges and version', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.version).toBe(3)
    expect(result.current.error).toBeNull()
  })

  it('onNodesChange applies a position change', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([
        { id: 'n1', type: 'position', position: { x: 111, y: 222 }, dragging: false },
      ])
    })
    expect(result.current.nodes[0].position).toEqual({ x: 111, y: 222 })
  })

  it('reload sets error on failure', async () => {
    const client = fakeClient()
    ;(client.getSubgraph as any).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useGraph(client, 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.error).toBe('boom')
  })

  it('exposes sorted types and applies visibleTypes to nodes and edges', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.types).toEqual(['Milestone', 'Task'])
    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.visibleTypes).toBeNull()

    act(() => {
      result.current.setVisibleTypes(new Set(['Task']))
    })
    expect(result.current.nodes.map((n) => n.id)).toEqual(['n1', 'n3'])
    expect(result.current.edges).toHaveLength(0)

    act(() => {
      result.current.setVisibleTypes(new Set(['Task', 'Milestone']))
    })
    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.edges).toHaveLength(2)
  })

  it('exposes sorted edgeTypes and applies visibleEdgeTypes to edges only', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.edgeTypes).toEqual(['blocks', 'depends_on'])
    expect(result.current.visibleEdgeTypes).toBeNull()
    act(() => {
      result.current.setVisibleEdgeTypes(new Set(['blocks']))
    })
    expect(result.current.edges.map((e) => e.id)).toEqual(['e2'])
    expect(result.current.nodes).toHaveLength(3)
  })

  it('hideOrphans drops nodes whose edges are all hidden by the edge filter', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.setVisibleEdgeTypes(new Set(['depends_on']))
      result.current.setHideOrphans(true)
    })
    expect(result.current.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
    act(() => {
      result.current.setHideOrphans(false)
    })
    expect(result.current.nodes).toHaveLength(3)
  })
})
