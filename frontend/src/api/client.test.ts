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

  it('saveVisualization carries opts.visibleSlices verbatim', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false, {
      visibleSlices: ['s1', 's2'],
    })
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body).visibleSlices).toEqual(['s1', 's2'])
  })

  it('saveVisualization omits visibleSlices when not provided', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    // no opts at all
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false)
    // opts with bends only — visibleSlices must still be absent
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false, {
      bends: { e1: { dx: 1, dy: 2 } },
    })
    for (const call of (fetch as any).mock.calls) {
      expect(JSON.parse(call[1].body)).not.toHaveProperty('visibleSlices')
    }
  })

  it('saveVisualization carries an empty visibleSlices array (show none)', async () => {
    mockFetchOnce(200, { id: 'v1' })
    const c = createClient('http://api')
    await c.saveVisualization('g1', 'default', {}, { x: 0, y: 0, zoom: 1 }, undefined, undefined, false, {
      visibleSlices: [],
    })
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body).visibleSlices).toEqual([])
  })
})

describe('slices', () => {
  it('listSlices GETs the collection and types the rows', async () => {
    mockFetchOnce(200, [
      { id: 's1', name: 'core', description: 'ядро', nodeCount: 3 },
      { id: 's2', name: 'edge', description: '', nodeCount: 0 },
    ])
    const c = createClient('http://api')
    const slices = await c.listSlices('g1')
    expect(slices[0].nodeCount).toBe(3)
    expect(slices[1].description).toBe('')
    expect(fetch).toHaveBeenCalledWith('http://api/graphs/g1/slices', expect.any(Object))
  })

  it('createSlice POSTs name/description/nodeIds', async () => {
    mockFetchOnce(201, { id: 's1', name: 'core', description: 'ядро', nodeCount: 2 })
    const c = createClient('http://api')
    const slice = await c.createSlice('g1', { name: 'core', description: 'ядро', nodeIds: ['n1', 'n2'] })
    expect(slice.nodeCount).toBe(2)
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/slices')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ name: 'core', description: 'ядро', nodeIds: ['n1', 'n2'] })
  })

  it('createSlice omits optional fields when not provided', async () => {
    mockFetchOnce(201, { id: 's1', name: 'core', description: '', nodeCount: 0 })
    const c = createClient('http://api')
    await c.createSlice('g1', { name: 'core' })
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body).toEqual({ name: 'core' })
    expect(body).not.toHaveProperty('description')
    expect(body).not.toHaveProperty('nodeIds')
  })

  it('getSlice GETs by the encoded name and types hydrated nodes', async () => {
    mockFetchOnce(200, {
      id: 's1',
      name: 'my slice',
      description: '',
      nodes: [{ id: 'n1', type: 'Task', properties: {}, sliceIds: ['s1'] }],
    })
    const c = createClient('http://api')
    const detail = await c.getSlice('g1', 'my slice')
    expect(detail.nodes[0].sliceIds).toEqual(['s1'])
    expect(fetch).toHaveBeenCalledWith('http://api/graphs/g1/slices/my%20slice', expect.any(Object))
  })

  it('renameSlice PATCHes only the provided fields', async () => {
    mockFetchOnce(200, { id: 's1', name: 'renamed', description: 'старое', nodeCount: 1 })
    const c = createClient('http://api')
    await c.renameSlice('g1', 'old', { name: 'renamed' })
    await c.renameSlice('g1', 'renamed', { description: 'новое' })
    const [url1, opts1] = (fetch as any).mock.calls[0]
    expect(url1).toBe('http://api/graphs/g1/slices/old')
    expect(opts1.method).toBe('PATCH')
    expect(JSON.parse(opts1.body)).toEqual({ name: 'renamed' })
    const [, opts2] = (fetch as any).mock.calls[1]
    expect(JSON.parse(opts2.body)).toEqual({ description: 'новое' })
  })

  it('deleteSlice DELETEs by the encoded name', async () => {
    mockFetchOnce(204, {})
    const c = createClient('http://api')
    await c.deleteSlice('g1', 'my slice')
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/slices/my%20slice')
    expect(opts.method).toBe('DELETE')
  })

  it('addSliceNodes POSTs the ids body', async () => {
    mockFetchOnce(200, { nodeCount: 2 })
    const c = createClient('http://api')
    const res = await c.addSliceNodes('g1', 'core', ['n1', 'n2'])
    expect(res.nodeCount).toBe(2)
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/slices/core/nodes')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ ids: ['n1', 'n2'] })
  })

  it('removeSliceNodes DELETEs with the ids body', async () => {
    mockFetchOnce(200, { nodeCount: 1 })
    const c = createClient('http://api')
    const res = await c.removeSliceNodes('g1', 'core', ['n2'])
    expect(res.nodeCount).toBe(1)
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('http://api/graphs/g1/slices/core/nodes')
    expect(opts.method).toBe('DELETE')
    expect(JSON.parse(opts.body)).toEqual({ ids: ['n2'] })
  })
})
