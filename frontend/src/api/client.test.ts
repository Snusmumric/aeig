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

describe('visualizations', () => {
  it('getDefaultVisualization GETs the default route', async () => {
    mockFetchOnce(200, { id: 'v1', name: 'quiet-harbor-42' })
    const c = createClient('http://api')
    const viz = await c.getDefaultVisualization('g1')
    expect(viz.name).toBe('quiet-harbor-42')
    expect(fetch).toHaveBeenCalledWith('http://api/graphs/g1/visualizations/default', expect.any(Object))
  })

  it('getVisualization GETs the encoded name', async () => {
    mockFetchOnce(200, { id: 'v1', name: 'my viz' })
    const c = createClient('http://api')
    await c.getVisualization('g1', 'my viz')
    expect(fetch).toHaveBeenCalledWith('http://api/graphs/g1/visualizations/my%20viz', expect.any(Object))
  })

  it('saveVisualization PUTs edgeTypes and hideOrphans', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization(
      'g1',
      'quiet-harbor-42',
      { n1: { x: 1, y: 2 } },
      { x: 0, y: 0, zoom: 1 },
      ['Task'],
      ['depends_on'],
      true,
    )
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/visualizations/quiet-harbor-42')
    expect(opts.method).toBe('PUT')
    expect(opts.keepalive).toBe(true)
    expect(JSON.parse(opts.body)).toEqual({
      positions: { n1: { x: 1, y: 2 } },
      viewport: { x: 0, y: 0, zoom: 1 },
      nodeTypes: ['Task'],
      edgeTypes: ['depends_on'],
      hideOrphans: true,
    })
  })

  it('saveVisualization omits undefined filters, keeps hideOrphans, encodes the name', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization('g1', 'my viz', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false)
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/visualizations/my%20viz')
    const body = JSON.parse(opts.body)
    expect(body).not.toHaveProperty('nodeTypes')
    expect(body).not.toHaveProperty('edgeTypes')
    expect(body.hideOrphans).toBe(false)
  })
})
