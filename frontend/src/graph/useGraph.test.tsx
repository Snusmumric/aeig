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
      nodes: [{ id: 'n1', type: 'Task', properties: {} }],
      edges: [],
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
    expect(result.current.nodes).toHaveLength(1)
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
})
