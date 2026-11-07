import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGraph } from './useGraph'
import type { ApiClient } from '../api/client'
import type { TypeStyleMap } from './typeStyle'

type DragEvt = { shiftKey?: boolean }
const drag = (n: { id: string; position: { x: number; y: number } }, shiftKey?: boolean) =>
  [((shiftKey === undefined ? {} : { shiftKey }) as DragEvt) as never, n as never, [n] as never] as const

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
    // allEdges stays the unfiltered superset the manifest sync builds from
    expect(result.current.allEdges.map((e) => e.id)).toEqual(['e1', 'e2'])
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

  it('shift-drag displaces followers by ring falloff', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const n2 = result.current.nodes.find((n) => n.id === 'n2')!
    const n3 = result.current.nodes.find((n) => n.id === 'n3')!
    const start1 = { ...n1.position }
    const start2 = { ...n2.position }
    const start3 = { ...n3.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, true))
    })
    act(() => {
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y + 40 } }, true))
    })
    // n2 ring 1 (e1 n1–n2), n3 ring 2 (e2 n2–n3)
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual({ x: start2.x + 40, y: start2.y + 20 }) // ½ of delta
    expect(result.current.nodes.find((n) => n.id === 'n3')!.position).toEqual({ x: start3.x + 20, y: start3.y + 10 }) // ¼ of delta
    act(() => {
      result.current.onNodeDragStop(...drag(n1, true))
    })
  })

  it('drag without shift moves nothing but the dragged node', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const n2 = result.current.nodes.find((n) => n.id === 'n2')!
    const start2 = { ...n2.position }
    const start3 = { ...result.current.nodes.find((n) => n.id === 'n3')!.position }
    const start1 = { ...n1.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, false))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y + 40 } }, false))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual(start2)
    expect(result.current.nodes.find((n) => n.id === 'n3')!.position).toEqual(start3)
  })

  it('touch event (no shiftKey) is a plain drag', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const n2 = result.current.nodes.find((n) => n.id === 'n2')!
    const start2 = { ...n2.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: n1.position.x + 30, y: n1.position.y } }))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual(start2)
  })

  it('single selected node still follows with shift', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([{ id: 'n1', type: 'select', selected: true }])
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const n2 = result.current.nodes.find((n) => n.id === 'n2')!
    const start1 = { ...n1.position }
    const start2 = { ...n2.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, true))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y } }, true))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual({ x: start2.x + 40, y: start2.y })
  })

  it('multi-selection disables follow', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([
        { id: 'n1', type: 'select', selected: true },
        { id: 'n2', type: 'select', selected: true },
      ])
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const start2 = { ...result.current.nodes.find((n) => n.id === 'n2')!.position }
    const start3 = { ...result.current.nodes.find((n) => n.id === 'n3')!.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, true))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: n1.position.x + 80, y: n1.position.y } }, true))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual(start2)
    expect(result.current.nodes.find((n) => n.id === 'n3')!.position).toEqual(start3)
  })

  it('filter change during drag does not re-plan followers', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const start1 = { ...n1.position }
    const start2 = { ...result.current.nodes.find((n) => n.id === 'n2')!.position }
    const start3 = { ...result.current.nodes.find((n) => n.id === 'n3')!.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, true))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y } }, true))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position.x).toBe(start2.x + 40)
    act(() => {
      result.current.setVisibleTypes(new Set(['Task', 'Milestone']))
    })
    act(() => {
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 160, y: start1.y } }, true))
    })
    // plan frozen at drag start: still ½ and ¼ of the total delta from starts
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual({ x: start2.x + 80, y: start2.y })
    expect(result.current.nodes.find((n) => n.id === 'n3')!.position).toEqual({ x: start3.x + 40, y: start3.y })
  })

  it('non-shift drag after a shift drag session is plain', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const n1 = result.current.nodes.find((n) => n.id === 'n1')!
    const start1 = { ...n1.position }
    const start2 = { ...result.current.nodes.find((n) => n.id === 'n2')!.position }
    act(() => {
      result.current.onNodeDragStart(...drag(n1, true))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y } }, true))
      result.current.onNodeDragStop(...drag(n1, true))
    })
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position.x).toBe(start2.x + 40)
    act(() => {
      result.current.onNodeDragStart(...drag(n1, false))
      result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 200, y: start1.y } }, false))
    })
    // followers stay at the follower-session end positions
    expect(result.current.nodes.find((n) => n.id === 'n2')!.position).toEqual({ x: start2.x + 40, y: start2.y })
  })

  it('anchors an edge to the sides facing each other (target right of source)', async () => {
    // default grid: n1(0,0) → n2(200,0): n2 is strictly right of n1
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const e1 = result.current.edges.find((e) => e.id === 'e1')!
    expect(e1.sourceHandle).toBe('r')
    expect(e1.targetHandle).toBe('l')
    expect(e1.data?.selfLoop).toBeUndefined()
  })

  it('re-anchors when a node moves: target below the source goes vertical', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([
        { id: 'n2', type: 'position', position: { x: 0, y: 200 }, dragging: false },
      ])
    })
    const e1 = result.current.edges.find((e) => e.id === 'e1')!
    expect(e1.sourceHandle).toBe('b')
    expect(e1.targetHandle).toBe('t')
  })

  it('diagonal boundary |dx| == |dy| picks the horizontal pair', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([
        { id: 'n2', type: 'position', position: { x: 150, y: 150 }, dragging: false },
      ])
    })
    const e1 = result.current.edges.find((e) => e.id === 'e1')!
    expect(e1.sourceHandle).toBe('r')
    expect(e1.targetHandle).toBe('l')
  })

  it('moving the target to the left flips the pair', async () => {
    const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    act(() => {
      result.current.onNodesChange([
        { id: 'n2', type: 'position', position: { x: -300, y: 0 }, dragging: false },
      ])
    })
    const e1 = result.current.edges.find((e) => e.id === 'e1')!
    expect(e1.sourceHandle).toBe('l')
    expect(e1.targetHandle).toBe('r')
  })

  it('flags self-loop edges in data', async () => {
    const client = fakeClient()
    ;(client.getSubgraph as any).mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
      ],
      edges: [{ id: 'e9', type: 'loops', source: 'n1', target: 'n1', properties: {} }],
    })
    const { result } = renderHook(() => useGraph(client, 'g1', styles))
    await act(async () => {
      await result.current.reload()
    })
    const e9 = result.current.edges.find((e) => e.id === 'e9')!
    expect(e9.data?.selfLoop).toBe(true)
    // coincident centers → horizontal default anchors
    expect(e9.sourceHandle).toBe('r')
    expect(e9.targetHandle).toBe('l')
  })
})
