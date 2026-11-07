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

  it('saveVisualization without manifest omits the binding fields', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, ['Task'], null, true)
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body).not.toHaveProperty('graphVersion')
    expect(body).not.toHaveProperty('nodes')
    expect(body).not.toHaveProperty('edges')
  })

  it('saveVisualization with manifest carries graphVersion/nodes/edges verbatim', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    const manifest = {
      graphVersion: 7,
      nodes: { n1: { type: 'Task', label: 'T1', x: 1, y: 2 } },
      edges: { e1: { type: 'depends_on', source: 'n1', target: 'n2' } },
    }
    await c.saveVisualization(
      'g1',
      'default',
      { n1: { x: 1, y: 2 } },
      { x: 0, y: 0, zoom: 1 },
      undefined,
      undefined,
      false,
      { manifest },
    )
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.graphVersion).toBe(7)
    expect(body.nodes).toEqual({ n1: { type: 'Task', label: 'T1', x: 1, y: 2 } })
    expect(body.edges).toEqual({ e1: { type: 'depends_on', source: 'n1', target: 'n2' } })
    // the rest of the payload is untouched
    expect(body.positions).toEqual({ n1: { x: 1, y: 2 } })
    expect(body.hideOrphans).toBe(false)
  })

  it('saveVisualization carries opts.bends verbatim', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    const bends = { e1: { dx: 5, dy: -3 }, e2: { dx: 0, dy: 10 } }
    await c.saveVisualization(
      'g1',
      'default',
      {},
      { x: 0, y: 0, zoom: 1 },
      undefined,
      undefined,
      false,
      { bends },
    )
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.bends).toEqual(bends)
  })

  it('saveVisualization omits bends when not provided', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    // no opts at all
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false)
    // opts with manifest only — bends must still be absent
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false, {
      manifest: { graphVersion: 7, nodes: {}, edges: {} },
    })
    for (const call of (fetch as any).mock.calls) {
      expect(JSON.parse(call[1].body)).not.toHaveProperty('bends')
    }
  })

  it('saveVisualization carries manifest and bends together in one opts bag', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false, {
      manifest: { graphVersion: 7, nodes: {}, edges: {} },
      bends: { e1: { dx: 1, dy: 2 } },
    })
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.graphVersion).toBe(7)
    expect(body.bends).toEqual({ e1: { dx: 1, dy: 2 } })
  })
})
