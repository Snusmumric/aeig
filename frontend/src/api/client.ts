import type { Graph, Subgraph, Mutations, Layout, Position, Viewport } from './types'

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
    listLayouts: (id: string) => request<Layout[]>(`${baseURL}/graphs/${id}/layouts`),
    saveLayout: (id: string, name: string, positions: Record<string, Position>, viewport: Viewport) =>
      request<Layout>(`${baseURL}/graphs/${id}/layouts`, {
        method: 'POST',
        body: JSON.stringify({ name, positions, viewport }),
      }),
    getLayout: (id: string, name: string) =>
      request<Layout>(`${baseURL}/graphs/${id}/layouts/${encodeURIComponent(name)}`),
  }
}

export type ApiClient = ReturnType<typeof createClient>
