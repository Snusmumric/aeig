import { describe, it, expect, vi, afterEach } from 'vitest'
import { createClient, ApiError } from './client'

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('getSubgraph parses nodes and edges', async () => {
    mockFetchOnce(200, {
      nodes: [{ id: 'n1', type: 'Task', properties: { status: 'open' } }],
      edges: [{ id: 'e1', type: 'rel', source: 'n1', target: 'n2', properties: {} }],
    })
    const c = createClient('http://api')
    const sg = await c.getSubgraph('g1')
    expect(sg.nodes).toHaveLength(1)
    expect(sg.nodes[0].type).toBe('Task')
    expect(sg.edges[0].source).toBe('n1')
    expect(fetch).toHaveBeenCalledWith('http://api/graphs/g1/subgraph', expect.any(Object))
  })

  it('applyMutations posts baseVersion and mutation fields', async () => {
    mockFetchOnce(200, { version: 4 })
    const c = createClient('http://api')
    const res = await c.applyMutations('g1', 3, {
      upsertNodes: [{ id: 'n1', type: 'Task', properties: {} }],
    })
    expect(res.version).toBe(4)
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({
      baseVersion: 3,
      upsertNodes: [{ id: 'n1', type: 'Task', properties: {} }],
    })
  })

  it('throws ApiError with status on non-2xx', async () => {
    mockFetchOnce(409, { error: 'version conflict' })
    const c = createClient('http://api')
    await expect(c.applyMutations('g1', 1, {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
    })
    await expect(c.applyMutations('g1', 1, {})).rejects.toBeInstanceOf(ApiError)
  })
})
