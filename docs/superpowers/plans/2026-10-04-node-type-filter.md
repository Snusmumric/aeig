# Node-Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canvas shows only the node types the user picks in a checkbox panel; the selection persists in saved layouts.

**Architecture:** Client-side filtering (server projection stays in Phase 2). `useGraph` keeps the full node/edge state and derives the visible subset through a pure `filterFlow` function; a `TypeFilterPanel` toolbar component toggles a `visibleTypes: Set<string> | null` (`null` = filter inactive). The set persists as an optional `nodeTypes` JSONB column on `layouts` (NULL = no filter), passed opaquely through service/httpapi to the repo.

**Tech Stack:** React 19 + @xyflow/react + Vitest (frontend), Go + chi + pgx + golang-migrate + testcontainers (backend).

**Spec:** `docs/superpowers/specs/2026-10-04-node-type-filter-design.md`

**Refinement vs spec:** the filter is applied to React-Flow node/edge objects (`filterFlow`) instead of the raw `Subgraph` before `toFlow` — identical semantics (node by type, edge visible iff both endpoints visible), but it preserves the existing drag-state architecture where the node array is the source of truth for positions.

## Global Constraints

- Node 18+ for all frontend commands; this machine defaults to Node 16 → run them as `zsh -ic 'nvm use 20 >/dev/null && <cmd>'` from `frontend/`.
- Go 1.22+; run backend commands from `backend/`.
- Repo cadence: code changes must keep `graphify-out/` committed. The post-commit hook rebuilds it in the background AFTER each commit, leaving a `graphify-out/` tail that the NEXT commit sweeps up. Every task's commit therefore adds `graphify-out/` if dirty; Task 7 does a final `make graph-refresh` sweep.
- No comments in code unless matching existing doc-comment style.
- `nil`/`NULL`/`undefined` everywhere means "no filter stored — show all types". An explicit empty array `[]` means "show none".
- Commit style: conventional (`feat:`, `test:`, `chore:`), lowercase, imperative.

---

### Task 1: `filterFlow` pure function (frontend)

**Files:**
- Create: `frontend/src/graph/filterFlow.ts`
- Test: `frontend/src/graph/filterFlow.test.ts`

**Interfaces:**
- Consumes: `TypedNodeData` from `frontend/src/graph/toFlow.ts` (`{ label, nodeType, style, properties }`), `Node`/`Edge` from `@xyflow/react`.
- Produces: `filterFlow(allNodes: Node<TypedNodeData>[], allEdges: Edge[], visibleTypes: Set<string> | null): { nodes: Node<TypedNodeData>[]; edges: Edge[] }` — used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { filterFlow } from './filterFlow'
import type { Edge, Node } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

function node(id: string, nodeType: string): Node<TypedNodeData> {
  return {
    id,
    type: 'typed',
    position: { x: 0, y: 0 },
    data: { label: id, nodeType, style: { shape: 'rectangle', color: '#000' }, properties: {} },
  }
}

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target })

const allNodes = [node('n1', 'service'), node('n2', 'domain'), node('n3', 'domain')]
const allEdges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n1', 'n3')]

describe('filterFlow', () => {
  it('null passthrough returns inputs unchanged', () => {
    const out = filterFlow(allNodes, allEdges, null)
    expect(out.nodes).toBe(allNodes)
    expect(out.edges).toBe(allEdges)
  })

  it('keeps nodes of selected types and edges whose both ends are kept', () => {
    const out = filterFlow(allNodes, allEdges, new Set(['domain']))
    expect(out.nodes.map((n) => n.id)).toEqual(['n2', 'n3'])
    expect(out.edges.map((e) => e.id)).toEqual(['e2'])
  })

  it('empty set drops everything', () => {
    const out = filterFlow(allNodes, allEdges, new Set())
    expect(out.nodes).toHaveLength(0)
    expect(out.edges).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/filterFlow.test.ts'`
Expected: FAIL — cannot resolve `./filterFlow`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Edge, Node } from '@xyflow/react'
import type { TypedNodeData } from './toFlow'

export function filterFlow(
  allNodes: Node<TypedNodeData>[],
  allEdges: Edge[],
  visibleTypes: Set<string> | null,
): { nodes: Node<TypedNodeData>[]; edges: Edge[] } {
  if (!visibleTypes) return { nodes: allNodes, edges: allEdges }
  const nodes = allNodes.filter((n) => visibleTypes.has(n.data.nodeType))
  const visible = new Set(nodes.map((n) => n.id))
  const edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
  return { nodes, edges }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/filterFlow.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/filterFlow.ts frontend/src/graph/filterFlow.test.ts graphify-out/
git commit -m "feat(fe): filterFlow pure function (visible node types, both-endpoint edges)"
```

---

### Task 2: Backend storage — `node_types` column, domain field, repo

**Files:**
- Create: `backend/internal/storage/postgres/migrations/0003_layout_node_types.up.sql`
- Create: `backend/internal/storage/postgres/migrations/0003_layout_node_types.down.sql`
- Modify: `backend/internal/domain/layout.go:16-23` (Layout struct)
- Modify: `backend/internal/storage/postgres/layouts.go` (SaveLayout, ListLayouts, GetLayoutByName, scanLayout)
- Test: `backend/internal/storage/postgres/layouts_integration_test.go` (update existing calls + new test)

**Interfaces:**
- Produces: `LayoutRepo.SaveLayout(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes []string) (domain.Layout, error)` — the 6th parameter `nodeTypes` (`nil` = no filter). `domain.Layout.NodeTypes *[]string` (`nil` = no filter, `[]` = show none). Tasks 3 consumes both.
- NOTE: this task changes the `SaveLayout` signature; `service` and `httpapi` won't compile until Task 3. To keep every task green, Task 2 updates ALL call sites minimally (pass `nil`) in `service/layout.go:29-40` — one line, no behavior change; Task 3 wires the real value through.

- [ ] **Step 1: Write the failing integration test (new) and update existing calls**

Append to `layouts_integration_test.go` (and add `, nil` as the last argument to the two existing `layouts.SaveLayout(...)` calls at lines 32 and 39):

```go
func TestLayoutRepo_NodeTypesRoundtrip(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	layouts := NewLayoutRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	saved, err := layouts.SaveLayout(ctx, g.ID, "filtered", nil, domain.Viewport{}, []string{"service", "domain"})
	require.NoError(t, err)
	require.NotNil(t, saved.NodeTypes)
	assert.Equal(t, []string{"service", "domain"}, *saved.NodeTypes)

	// upsert with nil overwrites node_types back to NULL
	_, err = layouts.SaveLayout(ctx, g.ID, "filtered", nil, domain.Viewport{}, nil)
	require.NoError(t, err)

	got, err := layouts.GetLayoutByName(ctx, g.ID, "filtered")
	require.NoError(t, err)
	assert.Nil(t, got.NodeTypes)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `go test -tags=integration ./internal/storage/postgres/ -run TestLayoutRepo_NodeTypesRoundtrip -v` (Docker is up; testcontainers needs it)
Expected: compile FAIL — `SaveLayout` takes 5 args / `saved.NodeTypes` undefined.

- [ ] **Step 3: Migration files**

`0003_layout_node_types.up.sql`:
```sql
ALTER TABLE layouts ADD COLUMN node_types JSONB NULL;
```

`0003_layout_node_types.down.sql`:
```sql
ALTER TABLE layouts DROP COLUMN IF EXISTS node_types;
```

- [ ] **Step 4: Domain field**

In `backend/internal/domain/layout.go`, add to `Layout` after `Viewport` (keep CreatedAt last):

```go
type Layout struct {
	ID        string              `json:"id"`
	GraphID   string              `json:"graphId"`
	Name      string              `json:"name"`
	Positions map[string]Position `json:"positions"`
	Viewport  Viewport            `json:"viewport"`
	NodeTypes *[]string           `json:"nodeTypes,omitempty"`
	CreatedAt time.Time           `json:"createdAt"`
}
```

- [ ] **Step 5: Repo — SaveLayout, SELECTs, scanLayout**

In `layouts.go` replace `SaveLayout` (keeps upsert semantics; `nil` typesJSON → SQL NULL):

```go
func (r *LayoutRepo) SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes []string) (domain.Layout, error) {
	posJSON, err := json.Marshal(positions)
	if err != nil {
		return domain.Layout{}, err
	}
	vpJSON, err := json.Marshal(vp)
	if err != nil {
		return domain.Layout{}, err
	}
	var typesJSON []byte
	if nodeTypes != nil {
		typesJSON, err = json.Marshal(nodeTypes)
		if err != nil {
			return domain.Layout{}, err
		}
	}
	out := domain.Layout{GraphID: graphID, Name: name, Positions: positions, Viewport: vp}
	if nodeTypes != nil {
		nt := nodeTypes
		out.NodeTypes = &nt
	}
	err = r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport, node_types)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (graph_id, name)
		 DO UPDATE SET positions = EXCLUDED.positions, viewport = EXCLUDED.viewport, node_types = EXCLUDED.node_types
		 RETURNING id, created_at`,
		uuid.NewString(), graphID, name, posJSON, vpJSON, typesJSON,
	).Scan(&out.ID, &out.CreatedAt)
	if err != nil {
		return domain.Layout{}, err
	}
	return out, nil
}
```

Update both SELECT column lists (ListLayouts line ~48, GetLayoutByName line ~68) to:

```sql
SELECT id, graph_id, name, positions, viewport, node_types, created_at
```

Replace `scanLayout`:

```go
func scanLayout(row rowScanner) (domain.Layout, error) {
	var l domain.Layout
	var posJSON, vpJSON, typesJSON []byte
	if err := row.Scan(&l.ID, &l.GraphID, &l.Name, &posJSON, &vpJSON, &typesJSON, &l.CreatedAt); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(posJSON, &l.Positions); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(vpJSON, &l.Viewport); err != nil {
		return domain.Layout{}, err
	}
	if len(typesJSON) > 0 {
		var nt []string
		if err := json.Unmarshal(typesJSON, &nt); err != nil {
			return domain.Layout{}, err
		}
		l.NodeTypes = &nt
	}
	return l, nil
}
```

- [ ] **Step 6: Keep the tree compiling — service call site**

In `backend/internal/service/layout.go` `SaveLayout` (line 29) and the `LayoutStore` interface (line 11): add the `nodeTypes []string` parameter to both signatures and pass `nodeTypes` through to `s.store.SaveLayout(ctx, graphID, name, positions, vp, nodeTypes)`. (Full service tests land in Task 3; compile fix only.)

- [ ] **Step 7: Run tests**

Run (from `backend/`): `go build ./... && go vet ./... && go test ./... && go test -tags=integration ./internal/storage/postgres/`
Expected: unit FAIL only in `service` stub (signature) if Task 3 not done — if so, fix the two stub call sites in `service/layout_test.go` by appending `nil` (or `, nil` where SaveLayout is called at lines 38, 44, 51-52) and the stub method signature at line 19 (add `_ []string` after `vp domain.Viewport`), then re-run. Integration: PASS including `TestLayoutRepo_NodeTypesRoundtrip`.

- [ ] **Step 8: Commit**

```bash
git add backend/ graphify-out/
git commit -m "feat(be): layouts.node_types JSONB column (domain + repo, nil=NULL=all types)"
```

---

### Task 3: Backend service + httpapi — optional `nodeTypes` in save-layout API

**Files:**
- Modify: `backend/internal/service/layout.go` (done in Task 2 Step 6; verify)
- Modify: `backend/internal/httpapi/layouts.go:13-17` (LayoutAPI), `:30-49` (handleSaveLayout)
- Test: `backend/internal/service/layout_test.go`, `backend/internal/httpapi/layouts_test.go`

**Interfaces:**
- Consumes: repo signature from Task 2.
- Produces: `LayoutAPI.SaveLayout(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes []string)`; REST `POST /graphs/{id}/layouts` accepts optional `"nodeTypes": ["a","b"]`; layout responses include `"nodeTypes"` when stored (via `domain.Layout` JSON tags).

- [ ] **Step 1: Write failing httpapi tests + update stub**

In `httpapi/layouts_test.go`: add field `gotTypes []string` to `stubLayoutAPI`; update its `SaveLayout` to the new signature recording it:

```go
func (s *stubLayoutAPI) SaveLayout(_ context.Context, _ string, name string, p map[string]domain.Position, _ domain.Viewport, nodeTypes []string) (domain.Layout, error) {
	s.gotName = name
	s.gotPosLen = len(p)
	s.gotTypes = nodeTypes
	if s.saveErr != nil {
		return domain.Layout{}, s.saveErr
	}
	return s.saved, nil
}
```

Add tests:

```go
func TestSaveLayout_NodeTypes_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default","nodeTypes":["service","domain"]}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, []string{"service", "domain"}, l.gotTypes)
}

func TestSaveLayout_NodeTypesAbsent_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default"}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Nil(t, l.gotTypes)
}
```

- [ ] **Step 2: Run to verify failure**

Run (from `backend/`): `go test ./internal/httpapi/ -run TestSaveLayout_NodeTypes -v`
Expected: compile FAIL (stub signature vs `LayoutAPI` interface mismatch) — that is the failing state.

- [ ] **Step 3: Implement httpapi**

In `layouts.go`: extend `LayoutAPI.SaveLayout` with `nodeTypes []string` (6th param) and `handleSaveLayout`:

```go
func handleSaveLayout(api LayoutAPI) http.HandlerFunc {
	type request struct {
		Name      string                     `json:"name"`
		Positions map[string]domain.Position `json:"positions"`
		Viewport  domain.Viewport            `json:"viewport"`
		NodeTypes []string                   `json:"nodeTypes"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		l, err := api.SaveLayout(r.Context(), chi.URLParam(r, "id"), req.Name, req.Positions, req.Viewport, req.NodeTypes)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, l)
	}
}
```

- [ ] **Step 4: Service pass-through test + verify all**

In `service/layout_test.go` extend `stubLayoutStore.SaveLayout` to record types:

```go
type stubLayoutStore struct {
	saved    domain.Layout
	list     []domain.Layout
	byName   domain.Layout
	getErr   error
	gotTypes []string
}

func (s *stubLayoutStore) SaveLayout(_ context.Context, graphID, name string, p map[string]domain.Position, vp domain.Viewport, nodeTypes []string) (domain.Layout, error) {
	s.saved = domain.Layout{ID: "l1", GraphID: graphID, Name: name, Positions: p, Viewport: vp}
	s.gotTypes = nodeTypes
	return s.saved, nil
}
```

Add:

```go
func TestLayoutService_SavePassesNodeTypes(t *testing.T) {
	store := &stubLayoutStore{}
	svc := NewLayoutService(store, &stubGraphExistence{})
	_, err := svc.SaveLayout(context.Background(), "g1", "default", nil, domain.Viewport{}, []string{"phase"})
	require.NoError(t, err)
	assert.Equal(t, []string{"phase"}, store.gotTypes)
}
```

Run (from `backend/`): `go build ./... && go vet ./... && go test ./...`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add backend/ graphify-out/
git commit -m "feat(be): optional nodeTypes on save-layout (service + httpapi passthrough)"
```

---

### Task 4: Frontend API — `Layout.nodeTypes` + client `saveLayout`

**Files:**
- Modify: `frontend/src/api/types.ts:45-52` (Layout)
- Modify: `frontend/src/api/client.ts:40-44` (saveLayout)
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `Layout { ..., nodeTypes?: string[] }`; `client.saveLayout(id, name, positions, viewport, nodeTypes?: string[])` — sends `nodeTypes` in the POST body only when the argument is not `undefined` (`undefined` → omitted; `[]` → sent as `[]`). Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Append to `client.test.ts`:

```ts
describe('saveLayout', () => {
  it('sends nodeTypes when provided (including empty array)', async () => {
    mockFetchOnce(201, { id: 'l1' })
    const c = createClient('http://api')
    await c.saveLayout('g1', 'n', { n1: { x: 0, y: 0 } }, { x: 0, y: 0, zoom: 1 }, ['phase'])
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body).nodeTypes).toEqual(['phase'])

    await c.saveLayout('g1', 'n', {}, { x: 0, y: 0, zoom: 1 }, [])
    const [, opts2] = (fetch as any).mock.calls[1]
    expect(JSON.parse(opts2.body).nodeTypes).toEqual([])
  })

  it('omits nodeTypes when undefined', async () => {
    mockFetchOnce(201, { id: 'l1' })
    const c = createClient('http://api')
    await c.saveLayout('g1', 'n', {}, { x: 0, y: 0, zoom: 1 })
    const [, opts] = (fetch as any).mock.calls[0]
    expect(JSON.parse(opts.body)).not.toHaveProperty('nodeTypes')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/api/client.test.ts'`
Expected: FAIL — `nodeTypes` never in body (and TS may reject the 5th argument).

- [ ] **Step 3: Implement**

`types.ts` Layout:

```ts
export interface Layout {
  id: string
  graphId: string
  name: string
  positions: Record<string, Position>
  viewport: Viewport
  nodeTypes?: string[]
  createdAt: string
}
```

`client.ts` saveLayout:

```ts
    saveLayout: (id: string, name: string, positions: Record<string, Position>, viewport: Viewport, nodeTypes?: string[]) =>
      request<Layout>(`${baseURL}/graphs/${id}/layouts`, {
        method: 'POST',
        body: JSON.stringify({ name, positions, viewport, ...(nodeTypes !== undefined ? { nodeTypes } : {}) }),
      }),
```

- [ ] **Step 4: Run to verify it passes**

Run: `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/api/client.test.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/ graphify-out/
git commit -m "feat(fe): api client sends optional nodeTypes on saveLayout"
```

---

### Task 5: `useGraph` — filter state and derived nodes/edges

**Files:**
- Modify: `frontend/src/graph/useGraph.ts`
- Test: `frontend/src/graph/useGraph.test.tsx`

**Interfaces:**
- Consumes: `filterFlow` from Task 1.
- Produces: `UseGraph` additionally exposes `types: string[]` (all node types of the loaded subgraph, sorted), `visibleTypes: Set<string> | null`, `setVisibleTypes: (v: Set<string> | null) => void`. `nodes`/`edges` are the FILTERED arrays (drag still works: position changes are applied to the full state via `onNodesChange`). Consumed by Tasks 6-7.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('useGraph', ...)` in `useGraph.test.tsx`, and extend the fake client's subgraph (replace its `getSubgraph` mock value):

```ts
    getSubgraph: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }],
    }),
```

New tests:

```ts
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
    expect(result.current.edges).toHaveLength(1)
  })
```

Note: the existing tests' expectations (`nodes` length 1 → now 3) must be updated: change `expect(result.current.nodes).toHaveLength(1)` to `3` in the first test.

- [ ] **Step 2: Run to verify failure**

Run (from `frontend/`): `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/useGraph.test.tsx'`
Expected: FAIL — `types`/`visibleTypes` undefined.

- [ ] **Step 3: Implement**

Replace `useGraph.ts` state + derivation (keep `reload` fetching `getGraph` + `getSubgraph`, now setting `allNodes`/`allEdges`):

```ts
import { useCallback, useMemo, useState } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedNodeData } from './toFlow'
import { filterFlow } from './filterFlow'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  edges: Edge[]
  types: string[]
  visibleTypes: Set<string> | null
  setVisibleTypes: (v: Set<string> | null) => void
  version: number
  error: string | null
  reload: (positions?: PositionMap) => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  setVersion: (v: number) => void
}

export function useGraph(client: ApiClient, graphId: string, styles: TypeStyleMap): UseGraph {
  const [allNodes, setAllNodes] = useState<Node<TypedNodeData>[]>([])
  const [allEdges, setAllEdges] = useState<Edge[]>([])
  const [visibleTypes, setVisibleTypes] = useState<Set<string> | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (positions?: PositionMap) => {
      try {
        const [graph, sg] = await Promise.all([client.getGraph(graphId), client.getSubgraph(graphId)])
        setVersion(graph.version)
        setAllNodes(toFlowNodes(sg, styles, positions))
        setAllEdges(toFlowEdges(sg, styles))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    },
    [client, graphId, styles],
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setAllNodes((nds) => applyNodeChanges(changes, nds) as Node<TypedNodeData>[])
  }, [])

  const { nodes, edges } = useMemo(() => filterFlow(allNodes, allEdges, visibleTypes), [allNodes, allEdges, visibleTypes])
  const types = useMemo(() => [...new Set(allNodes.map((n) => n.data.nodeType))].sort(), [allNodes])

  return { nodes, edges, types, visibleTypes, setVisibleTypes, version, error, reload, onNodesChange, setVersion }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/useGraph.test.tsx'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/useGraph.ts frontend/src/graph/useGraph.test.tsx graphify-out/
git commit -m "feat(fe): useGraph exposes types + visibleTypes, derives filtered nodes/edges"
```

---

### Task 6: `TypeFilterPanel` component

**Files:**
- Create: `frontend/src/graph/TypeFilterPanel.tsx`
- Test: `frontend/src/graph/TypeFilterPanel.test.tsx`

**Interfaces:**
- Consumes: `TypeStyleMap` from `./typeStyle` for swatch colors.
- Produces: `TypeFilterPanelProps { types: string[]; visibleTypes: Set<string> | null; styles: TypeStyleMap; onChange: (next: Set<string> | null) => void }`. Semantics: a checkbox per type; unchecking moves to an explicit set; checking everything (or «Все») normalizes to `null`; «Ни одного» → `new Set()`. Consumed by Task 7.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TypeFilterPanel } from './TypeFilterPanel'
import type { TypeStyleMap } from './typeStyle'

const styles: TypeStyleMap = { phase: { shape: 'diamond', color: '#dc2626' } }

describe('TypeFilterPanel', () => {
  it('renders a labeled checkbox per type with a swatch', () => {
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={null} styles={styles} onChange={vi.fn()} />)
    expect(screen.getByTestId('type-phase')).toBeChecked()
    expect(screen.getByTestId('type-slice')).toBeChecked()
    expect(screen.getByText('phase')).toBeInTheDocument()
  })

  it('unchecking a type calls onChange with that type excluded', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={null} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('type-phase'))
    expect(onChange).toHaveBeenCalledWith(new Set(['slice']))
  })

  it('checking the last unchecked type normalizes to null', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase', 'slice']} visibleTypes={new Set(['slice'])} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('type-phase'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Все / Ни одного buttons', () => {
    const onChange = vi.fn()
    render(<TypeFilterPanel types={['phase']} visibleTypes={new Set()} styles={styles} onChange={onChange} />)
    fireEvent.click(screen.getByText('Все'))
    expect(onChange).toHaveBeenCalledWith(null)
    fireEvent.click(screen.getByText('Ни одного'))
    expect(onChange).toHaveBeenCalledWith(new Set())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/TypeFilterPanel.test.tsx'`
Expected: FAIL — cannot resolve `./TypeFilterPanel`.

- [ ] **Step 3: Implement**

```tsx
import type { TypeStyleMap } from './typeStyle'

export interface TypeFilterPanelProps {
  types: string[]
  visibleTypes: Set<string> | null
  styles: TypeStyleMap
  onChange: (next: Set<string> | null) => void
}

export function TypeFilterPanel({ types, visibleTypes, styles, onChange }: TypeFilterPanelProps) {
  const isChecked = (t: string) => !visibleTypes || visibleTypes.has(t)

  const toggle = (t: string) => {
    const next = new Set(visibleTypes ?? types)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    onChange(next.size === types.length ? null : next)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} data-testid="type-filter">
      {types.map((t) => (
        <label key={t} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isChecked(t)}
            onChange={() => toggle(t)}
            data-testid={`type-${t}`}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: styles[t]?.color ?? '#8899aa',
              display: 'inline-block',
            }}
          />
          {t}
        </label>
      ))}
      <button onClick={() => onChange(null)}>Все</button>
      <button onClick={() => onChange(new Set())}>Ни одного</button>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/TypeFilterPanel.test.tsx'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/TypeFilterPanel.tsx frontend/src/graph/TypeFilterPanel.test.tsx graphify-out/
git commit -m "feat(fe): TypeFilterPanel checkbox list with color swatches"
```

---

### Task 7: `GraphEditor` wiring + full verification

**Files:**
- Modify: `frontend/src/graph/GraphEditor.tsx`
- Test: `frontend/src/graph/GraphEditor.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4-6.
- Produces: the finished feature — panel between LayoutBar and error notice; save sends `nodeTypes` when the filter is active; load applies stored types; «Add Task» auto-enables `Task` in an active filter.

- [ ] **Step 1: Write the failing tests**

Replace `GraphEditor.test.tsx` fake client's `getSubgraph` mock and add tests:

```tsx
function fakeClient(): ApiClient {
  return {
    getGraph: vi.fn().mockResolvedValue({ id: 'g1', name: 'g', version: 1, createdAt: '' }),
    getSubgraph: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
      ],
      edges: [],
    }),
    listLayouts: vi.fn().mockResolvedValue([]),
    saveLayout: vi.fn(),
    getLayout: vi.fn(),
    createGraph: vi.fn(),
    applyMutations: vi.fn(),
  } as unknown as ApiClient
}
```

New tests (keep the existing mounts test):

```tsx
  it('renders the type filter panel with a checkbox per type', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    expect(screen.getByTestId('type-Task')).toBeChecked()
    expect(screen.getByTestId('type-Milestone')).toBeChecked()
  })

  it('unchecking a type hides its nodes', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await waitFor(() => expect(screen.queryByText('n2')).not.toBeInTheDocument())
    expect(screen.getByText('n1')).toBeInTheDocument()
  })

  it('saving a layout includes nodeTypes when the filter is active', async () => {
    const client = fakeClient()
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('type-Milestone'))
    fireEvent.click(screen.getByText('Save layout'))
    await waitFor(() => expect(client.saveLayout).toHaveBeenCalled())
    const args = (client.saveLayout as any).mock.calls[0]
    expect(args[4]).toEqual(['Task'])
  })

  it('loading a layout applies its nodeTypes', async () => {
    const client = fakeClient()
    ;(client.getLayout as any).mockResolvedValue({
      id: 'l1', graphId: 'g1', name: 'default', positions: {}, viewport: { x: 0, y: 0, zoom: 1 },
      nodeTypes: ['Task'],
    })
    ;(client.listLayouts as any).mockResolvedValue([{ id: 'l1', name: 'default' }])
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument())
    fireEvent.click(screen.getByText('default'))
    await waitFor(() => expect(screen.queryByText('n2')).not.toBeInTheDocument())
    expect(screen.getByTestId('type-Milestone')).not.toBeChecked()
  })
```

Add imports: `import { fireEvent } from '@testing-library/react'`.

Note: node labels render as `properties['label'] ?? n.id` — the fake nodes have no label property, so they render `n1`/`n2`.

- [ ] **Step 2: Run to verify failure**

Run (from `frontend/`): `zsh -ic 'nvm use 20 >/dev/null && npm test -- src/graph/GraphEditor.test.tsx'`
Expected: FAIL — no `type-filter` testid.

- [ ] **Step 3: Implement in GraphEditor.tsx**

Destructure the new fields from `useGraph`:

```tsx
  const {
    nodes, edges, version, error, reload, onNodesChange, setVersion,
    types, visibleTypes, setVisibleTypes,
  } = useGraph(client, graphId, styles)
```

Auto-enable `Task` on creation (top of `addNode`, before `commitMutation`):

```tsx
  const addNode = useCallback(async () => {
    setVisibleTypes((prev) => (prev && !prev.has('Task') ? new Set(prev).add('Task') : prev))
    const res = await commitMutation(client, graphId, version, newNodeMutation('Task'))
    ...unchanged...
```

`onSaveLayout` sends the active set:

```tsx
  const onSaveLayout = useCallback(
    async (name: string) => {
      const nodeTypes = visibleTypes ? [...visibleTypes] : undefined
      await client.saveLayout(graphId, name, extractPositions(nodes), { x: 0, y: 0, zoom: 1 }, nodeTypes)
      await refreshLayouts()
    },
    [client, graphId, nodes, visibleTypes, refreshLayouts],
  )
```

`onLoadLayout` applies stored types:

```tsx
  const onLoadLayout = useCallback(
    async (name: string) => {
      const l = await client.getLayout(graphId, name)
      setVisibleTypes(l.nodeTypes ? new Set(l.nodeTypes) : null)
      await reload(l.positions)
    },
    [client, graphId, reload, setVisibleTypes],
  )
```

Render the panel right after `<LayoutBar ... />`:

```tsx
        <TypeFilterPanel
          types={types}
          visibleTypes={visibleTypes}
          styles={styles}
          onChange={setVisibleTypes}
        />
```

Add import: `import { TypeFilterPanel } from './TypeFilterPanel'`.

- [ ] **Step 4: Full verification**

From `frontend/`: `zsh -ic 'nvm use 20 >/dev/null && npm test && npm run build'`
Expected: all Vitest files PASS, `tsc -b && vite build` succeeds.

From `backend/`: `go build ./... && go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 5: Graph cadence + commit**

```bash
make graph-refresh
git add frontend/ graphify-out/
git commit -m "feat(fe): type filter panel wiring — filter canvas, persist selection in layouts"
```

Manual live check (optional, sandbox limits apply): `nvm use 20 && PG_PORT=5433 make dev`, open `http://localhost:5173/`, uncheck types, save/load a layout.
