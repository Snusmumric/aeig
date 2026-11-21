import type {
  Graph,
  Subgraph,
  Mutations,
  Visualization,
  SaveVisualizationOptions,
  Position,
  Viewport,
  Slice,
  SliceDetail,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, msg)
  }
  return body as T
}

export function createClient(baseURL: string) {
  return {
    createGraph: (name: string) =>
      request<Graph>(`${baseURL}/graphs`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    getGraph: (id: string) => request<Graph>(`${baseURL}/graphs/${id}`),
    getSubgraph: (id: string) => request<Subgraph>(`${baseURL}/graphs/${id}/subgraph`),
    applyMutations: (id: string, baseVersion: number, m: Mutations) =>
      request<{ version: number }>(`${baseURL}/graphs/${id}/mutations`, {
        method: 'POST',
        body: JSON.stringify({ baseVersion, ...m }),
      }),
    getVisualization: (id: string, name: string) =>
      request<Visualization>(`${baseURL}/graphs/${id}/visualizations/${encodeURIComponent(name)}`),
    getDefaultVisualization: (id: string) =>
      request<Visualization>(`${baseURL}/graphs/${id}/visualizations/default`),
    saveVisualization: (
      id: string,
      name: string,
      positions: Record<string, Position>,
      viewport: Viewport,
      nodeTypes: string[] | undefined,
      edgeTypes: string[] | null | undefined,
      hideOrphans: boolean,
      // binding refreshes ONLY via sync; bends = full live-edge map —
      // each carried in the PUT body only when provided
      opts?: SaveVisualizationOptions,
    ) =>
      request<Visualization>(`${baseURL}/graphs/${id}/visualizations/${encodeURIComponent(name)}`, {
        method: 'PUT',
        keepalive: true,
        body: JSON.stringify({
          positions,
          viewport,
          ...(nodeTypes !== undefined ? { nodeTypes } : {}),
          ...(edgeTypes !== undefined ? { edgeTypes } : {}),
          hideOrphans,
          ...(opts?.manifest !== undefined
            ? { graphVersion: opts.manifest.graphVersion, nodes: opts.manifest.nodes, edges: opts.manifest.edges }
            : {}),
          ...(opts?.bends !== undefined ? { bends: opts.bends } : {}),
          ...(opts?.visibleSlices !== undefined ? { visibleSlices: opts.visibleSlices } : {}),
        }),
      }),
    // slices — name-addressed, like visualizations; membership ops are
    // idempotent and echo the current member count
    listSlices: (id: string) => request<Slice[]>(`${baseURL}/graphs/${id}/slices`),
    createSlice: (id: string, s: { name: string; description?: string; nodeIds?: string[] }) =>
      request<Slice>(`${baseURL}/graphs/${id}/slices`, {
        method: 'POST',
        body: JSON.stringify({
          name: s.name,
          ...(s.description !== undefined ? { description: s.description } : {}),
          ...(s.nodeIds !== undefined ? { nodeIds: s.nodeIds } : {}),
        }),
      }),
    getSlice: (id: string, name: string) =>
      request<SliceDetail>(`${baseURL}/graphs/${id}/slices/${encodeURIComponent(name)}`),
    renameSlice: (id: string, name: string, patch: { name?: string; description?: string }) =>
      request<Slice>(`${baseURL}/graphs/${id}/slices/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        }),
      }),
    deleteSlice: (id: string, name: string) =>
      request<void>(`${baseURL}/graphs/${id}/slices/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    addSliceNodes: (id: string, name: string, ids: string[]) =>
      request<{ nodeCount: number }>(`${baseURL}/graphs/${id}/slices/${encodeURIComponent(name)}/nodes`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    removeSliceNodes: (id: string, name: string, ids: string[]) =>
      request<{ nodeCount: number }>(`${baseURL}/graphs/${id}/slices/${encodeURIComponent(name)}/nodes`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
  }
}

export type ApiClient = ReturnType<typeof createClient>
