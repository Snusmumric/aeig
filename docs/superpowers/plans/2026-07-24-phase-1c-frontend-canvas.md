# Phase 1C — Frontend Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the React + TypeScript frontend that fetches a graph's subgraph from the 1B API and renders it on a React Flow canvas, with node/edge appearance (shape + color) driven by a type→style map so identical types look identical.

**Architecture:** A thin typed API client wraps `fetch` over the 1B REST surface. A pure `toFlow` transform maps `domain.Subgraph` JSON into React Flow `Node[]`/`Edge[]`, resolving each element's visual style from a `TypeStyleMap`. A `GraphCanvas` component renders `<ReactFlow>` with a single custom node type (`TypedNode`) that draws the shape/color. Pure logic (client parsing, transform, style resolution) is unit-tested with Vitest; the canvas gets a mount smoke test.

**Tech Stack:** Vite, React 18, TypeScript 5, `@xyflow/react` (React Flow v12), Vitest, `@testing-library/react`, `@testing-library/jest-dom`, jsdom.

## Global Constraints

- Frontend lives under `frontend/` at the repo root; package name `aeig-frontend`.
- API base URL comes from `import.meta.env.VITE_API_URL` (default `http://localhost:8080`); the client is created with an explicit base so tests inject their own.
- JSON field names match the backend exactly: `upsertNodes`, `upsertEdges`, `deleteNodeIds`, `deleteEdgeIds`, `baseVersion`, `properties`, `createdAt`. `version` is a JS `number` in phase 1.
- All React Flow node data flows through one custom node type keyed `"typed"`; there are no default-styled nodes.

---

## Task 1: Scaffold frontend, API types, API client

**Files:**
- Create: `frontend/` via Vite (`package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`)
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes: the 1B REST API (`/graphs`, `/graphs/{id}`, `/graphs/{id}/subgraph`, `/graphs/{id}/mutations`).
- Produces:
  - Types `Graph`, `GraphNode`, `GraphEdge`, `Subgraph`, `Mutations` (in `types.ts`).
  - `ApiError extends Error { status: number }`.
  - `createClient(baseURL: string)` returning `{ createGraph(name): Promise<Graph>; getGraph(id): Promise<Graph>; getSubgraph(id): Promise<Subgraph>; applyMutations(id, baseVersion, m): Promise<{version:number}> }`.

- [ ] **Step 1: Scaffold and install**

```bash
cd <repo root>
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @xyflow/react
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Configure Vitest**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Create `frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'

// React Flow needs these browser APIs that jsdom lacks.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as any).ResizeObserver = ResizeObserverMock

if (!(globalThis as any).DOMMatrixReadOnly) {
  ;(globalThis as any).DOMMatrixReadOnly = class {
    m22 = 1
    constructor() {}
  }
}
```

Add to `frontend/package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Write the failing API client test**

Create `frontend/src/api/client.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 5: Write the types**

Create `frontend/src/api/types.ts`:

```ts
export interface Graph {
  id: string
  name: string
  version: number
  createdAt: string
}

export interface GraphNode {
  id: string
  type: string
  properties: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  type: string
  source: string
  target: string
  properties: Record<string, unknown>
}

export interface Subgraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Mutations {
  upsertNodes?: GraphNode[]
  upsertEdges?: GraphEdge[]
  deleteNodeIds?: string[]
  deleteEdgeIds?: string[]
}
```

- [ ] **Step 6: Write the client**

Create `frontend/src/api/client.ts`:

```ts
import type { Graph, Subgraph, Mutations } from './types'

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
  }
}

export type ApiClient = ReturnType<typeof createClient>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold vite/react/ts, api types and client"
```

---

## Task 2: Type-style resolution and subgraph→React Flow transform

**Files:**
- Create: `frontend/src/graph/typeStyle.ts`
- Create: `frontend/src/graph/toFlow.ts`
- Test: `frontend/src/graph/toFlow.test.ts`

**Interfaces:**
- Consumes: `Subgraph`, `GraphNode`, `GraphEdge` from `../api/types`; React Flow `Node`, `Edge` types.
- Produces:
  - `NodeShape = 'rectangle' | 'ellipse' | 'diamond'`, `TypeStyle { shape: NodeShape; color: string }`, `TypeStyleMap = Record<string, TypeStyle>`, `DEFAULT_STYLE`, `resolveStyle(map, type) => TypeStyle`.
  - `TypedNodeData { label: string; nodeType: string; style: TypeStyle; properties: Record<string, unknown> }` (index-signature-compatible with React Flow node data).
  - `toFlowNodes(sg, styles, positions?) => Node<TypedNodeData>[]` — grid fallback positions when none supplied.
  - `toFlowEdges(sg, styles) => Edge[]`.

- [ ] **Step 1: Write the failing transform test**

Create `frontend/src/graph/toFlow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toFlowNodes, toFlowEdges } from './toFlow'
import type { TypeStyleMap } from './typeStyle'
import type { Subgraph } from '../api/types'

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  depends_on: { shape: 'rectangle', color: '#cc3366' },
}

const sg: Subgraph = {
  nodes: [
    { id: 'n1', type: 'Task', properties: { label: 'First' } },
    { id: 'n2', type: 'Unknown', properties: {} },
  ],
  edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }],
}

describe('toFlow', () => {
  it('maps nodes with type, style, and label', () => {
    const nodes = toFlowNodes(sg, styles)
    expect(nodes[0]).toMatchObject({
      id: 'n1',
      type: 'typed',
      data: { label: 'First', nodeType: 'Task', style: { shape: 'rectangle', color: '#3366cc' } },
    })
    // label falls back to id, style falls back to default for unknown type
    expect(nodes[1].data.label).toBe('n2')
    expect(nodes[1].data.style.color).toBe('#8899aa')
  })

  it('uses provided positions over the grid fallback', () => {
    const nodes = toFlowNodes(sg, styles, { n1: { x: 42, y: 99 } })
    expect(nodes[0].position).toEqual({ x: 42, y: 99 })
    expect(nodes[1].position).toEqual({ x: 200, y: 0 }) // grid fallback for index 1
  })

  it('maps edges with label and stroke color', () => {
    const edges = toFlowEdges(sg, styles)
    expect(edges[0]).toMatchObject({ id: 'e1', source: 'n1', target: 'n2', label: 'depends_on' })
    expect(edges[0].style?.stroke).toBe('#cc3366')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./toFlow`.

- [ ] **Step 3: Write the type-style module**

Create `frontend/src/graph/typeStyle.ts`:

```ts
export type NodeShape = 'rectangle' | 'ellipse' | 'diamond'

export interface TypeStyle {
  shape: NodeShape
  color: string
}

export type TypeStyleMap = Record<string, TypeStyle>

export const DEFAULT_STYLE: TypeStyle = { shape: 'rectangle', color: '#8899aa' }

export function resolveStyle(map: TypeStyleMap, type: string): TypeStyle {
  return map[type] ?? DEFAULT_STYLE
}
```

- [ ] **Step 4: Write the transform**

Create `frontend/src/graph/toFlow.ts`:

```ts
import type { Node, Edge } from '@xyflow/react'
import type { Subgraph } from '../api/types'
import { resolveStyle, type TypeStyle, type TypeStyleMap } from './typeStyle'

export interface TypedNodeData {
  label: string
  nodeType: string
  style: TypeStyle
  properties: Record<string, unknown>
  [key: string]: unknown
}

const GRID_COLS = 5
const GRID_DX = 200
const GRID_DY = 150

export function toFlowNodes(
  sg: Subgraph,
  styles: TypeStyleMap,
  positions?: Record<string, { x: number; y: number }>,
): Node<TypedNodeData>[] {
  return sg.nodes.map((n, i) => ({
    id: n.id,
    type: 'typed',
    position:
      positions?.[n.id] ?? {
        x: (i % GRID_COLS) * GRID_DX,
        y: Math.floor(i / GRID_COLS) * GRID_DY,
      },
    data: {
      label: (n.properties['label'] as string) ?? n.id,
      nodeType: n.type,
      style: resolveStyle(styles, n.type),
      properties: n.properties,
    },
  }))
}

export function toFlowEdges(sg: Subgraph, styles: TypeStyleMap): Edge[] {
  return sg.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.type,
    style: { stroke: resolveStyle(styles, e.type).color },
  }))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): type-style resolution and subgraph->react-flow transform"
```

---

## Task 3: Custom typed node and GraphCanvas

**Files:**
- Create: `frontend/src/graph/TypedNode.tsx`
- Create: `frontend/src/graph/GraphCanvas.tsx`
- Modify: `frontend/src/App.tsx` (render a demo subgraph)
- Test: `frontend/src/graph/TypedNode.test.tsx`
- Test: `frontend/src/graph/GraphCanvas.test.tsx`

**Interfaces:**
- Consumes: `TypedNodeData` (Task 2), React Flow `ReactFlow`, `Handle`, `Position`, `ReactFlowProvider`, `Node`, `Edge`.
- Produces:
  - `TypedNode` — custom node component; renders `data-testid="typed-node"`, `data-node-type={nodeType}`, the label, and shape/color CSS.
  - `nodeTypes = { typed: TypedNode }`.
  - `GraphCanvas({ nodes, edges }: { nodes: Node[]; edges: Edge[] })` — wraps `<ReactFlow>` with `data-testid="graph-canvas"`.

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/graph/TypedNode.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { TypedNode } from './TypedNode'

function renderNode(data: unknown) {
  return render(
    <ReactFlowProvider>
      <TypedNode {...({ data } as never)} />
    </ReactFlowProvider>,
  )
}

describe('TypedNode', () => {
  it('renders label and type, applies ellipse shape', () => {
    renderNode({
      label: 'Hi',
      nodeType: 'Task',
      style: { shape: 'ellipse', color: '#ff0000' },
      properties: {},
    })
    const el = screen.getByTestId('typed-node')
    expect(el).toHaveAttribute('data-node-type', 'Task')
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(el).toHaveStyle({ borderRadius: '50%' })
  })
})
```

Create `frontend/src/graph/GraphCanvas.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'

describe('GraphCanvas', () => {
  it('mounts the canvas container without crashing', () => {
    render(<GraphCanvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./TypedNode` / `./GraphCanvas`.

- [ ] **Step 3: Write the TypedNode component**

Create `frontend/src/graph/TypedNode.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

function shapeStyle(data: TypedNodeData): CSSProperties {
  const base: CSSProperties = {
    background: data.style.color,
    padding: 10,
    minWidth: 80,
    textAlign: 'center',
    color: '#fff',
    border: '1px solid rgba(0,0,0,0.25)',
  }
  switch (data.style.shape) {
    case 'ellipse':
      return { ...base, borderRadius: '50%' }
    case 'diamond':
      return { ...base, clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' }
    default:
      return { ...base, borderRadius: 4 }
  }
}

export function TypedNode(props: NodeProps) {
  const data = props.data as TypedNodeData
  return (
    <div style={shapeStyle(data)} data-testid="typed-node" data-node-type={data.nodeType}>
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
```

- [ ] **Step 4: Write the GraphCanvas component**

Create `frontend/src/graph/GraphCanvas.tsx`:

```tsx
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TypedNode } from './TypedNode'

const nodeTypes = { typed: TypedNode }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
}

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 5: Wire a demo into App**

Replace `frontend/src/App.tsx` with:

```tsx
import { toFlowNodes, toFlowEdges } from './graph/toFlow'
import { GraphCanvas } from './graph/GraphCanvas'
import type { TypeStyleMap } from './graph/typeStyle'
import type { Subgraph } from './api/types'

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  Milestone: { shape: 'diamond', color: '#cc6633' },
  depends_on: { shape: 'rectangle', color: '#888888' },
}

const demo: Subgraph = {
  nodes: [
    { id: 'm1', type: 'Milestone', properties: { label: 'Release' } },
    { id: 't1', type: 'Task', properties: { label: 'Build API' } },
    { id: 't2', type: 'Task', properties: { label: 'Build UI' } },
  ],
  edges: [
    { id: 'e1', type: 'depends_on', source: 't1', target: 'm1', properties: {} },
    { id: 'e2', type: 'depends_on', source: 't2', target: 'm1', properties: {} },
  ],
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <GraphCanvas nodes={toFlowNodes(demo, styles)} edges={toFlowEdges(demo, styles)} />
    </div>
  )
}
```

- [ ] **Step 6: Run tests, typecheck, and build**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run build`
Expected: tests PASS; no type errors; build succeeds.

- [ ] **Step 7: Manual visual check**

Run: `cd frontend && npm run dev`, open the shown URL.
Expected: three nodes — a diamond `Release`, two rectangles `Build API` / `Build UI` — with two edges labeled `depends_on`, pan/zoom working.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "feat(frontend): typed custom node and react-flow graph canvas"
```

---

## Self-Review (slice 1C)

**Spec coverage (against §6.1 rendering):**
- Render a subgraph fetched from the API → API client (Task 1) + transform (Task 2). ✓
- Custom node per type; shape + color from a type→style map; identical types identical → `resolveStyle` + `TypedNode` (Tasks 2–3). ✓
- Infinite pan/zoom canvas → React Flow `<ReactFlow>` with Background/Controls (Task 3). ✓
- Edge label shows the edge type; stroke colored by type → `toFlowEdges` (Task 2). ✓

**Deferred to 1D (intentionally not here):** live fetch wiring to a real graph id, manual drag persistence, named layouts (the `positions` param of `toFlowNodes` already exists as the seam), node/edge editing, directed/undirected marker distinction, containment nesting (phase 2).

**Placeholder scan:** none — every step has runnable code/commands.

**Type consistency:** `TypedNodeData` is defined once (Task 2) and consumed by `TypedNode` (Task 3); `nodeTypes` key `"typed"` matches the `type: 'typed'` set in `toFlowNodes`. API JSON field names (`upsertNodes`/`baseVersion`/`properties`/`createdAt`) match the 1B backend and the 1B curl smoke test.

---

## Post-completion: build the frontend code knowledge graph (`/graphify`)

Run this only **after** all three tasks are merged and the slice self-review passes. It builds a persistent, queryable knowledge graph of the React/TypeScript frontend produced in this slice, mirroring the backend graph from 1B so later phases can reason across both.

- [ ] **Step 1: Run the pipeline over the frontend code**

From the repo root:

```
/graphify frontend
```

The TS/React corpus is code-only, so extraction is pure **AST** — deterministic, no API key, no LLM token cost. Outputs land in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`).

> If 1B already produced a `graphify-out/` at the repo root, run `/graphify frontend --update` instead so the frontend files are added incrementally rather than overwriting the backend graph — or build the frontend graph into its own directory by running from `frontend/` (`cd frontend && /graphify .`). Pick one convention and keep it consistent across phases.

- [ ] **Step 2: Sanity-check the graph**

Confirm the run reported a **non-empty** graph (nodes/edges > 0) and `Graph health: OK`. Skim `graphify-out/GRAPH_REPORT.md`; the God Nodes should surface the expected hubs — `src/graph` (`GraphCanvas`, `useGraph`, `toFlow`, `TypedNode`) and `src/api` (`client`, `types`). The `api/client` node should bridge the `graph` community to the (backend-defined) API surface.

- [ ] **Step 3: Record the artifact**

Add `graphify-out/` to `.gitignore` if not already done in 1B, or commit `graphify-out/GRAPH_REPORT.md` alone if the team versions the audit trail. Do not commit the `graph.html`/`graph.json` blobs unless deliberately desired.


