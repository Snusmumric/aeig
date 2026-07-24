# Phase 1D — Interaction (Live Load, Drag, Named Layouts, Editing) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas interactive against a live graph: load a graph by id, drag nodes and persist positions as named layouts, restore a saved layout on load, create/delete nodes and edges through the mutations API under optimistic version control, and recover from a 409 by re-fetching.

**Architecture:** Backend gains a `layouts` table plus a `LayoutRepo`/`LayoutService` and REST endpoints (positions stored as JSONB, keyed uniquely per `(graph_id, name)`). Frontend gains a `useGraph` hook holding React Flow state fed by the API, a pure `extractPositions` helper, layout save/load client methods and a small toolbar, and a `commitMutation` helper that maps 409 to a reload signal.

**Tech Stack:** Backend — Go, pgx, testcontainers (as 1A/1B). Frontend — React hooks, `@xyflow/react` (`applyNodeChanges`, `useReactFlow`), Vitest + Testing Library (as 1C).

## Global Constraints

- Builds on 1A/1B/1C. Module path `github.com/aeig/backend`; frontend under `frontend/`.
- Layout positions map node id → `{x, y}`; a layout also stores the viewport `{x, y, zoom}`. Saving the same `(graphId, name)` overwrites (upsert).
- Every create/delete goes through `POST /graphs/{id}/mutations` with the current `baseVersion`; a 409 response must trigger a full re-fetch (`getGraph` + `getSubgraph`) and surface a non-fatal notice — never a silent drop.
- Layout writes do **not** bump the graph version: per design §7, editing positions ≠ editing graph data.

---

## Task 1: Layouts storage (migration + repository)

**Files:**
- Create: `backend/internal/storage/postgres/migrations/0002_layouts.up.sql`
- Create: `backend/internal/storage/postgres/migrations/0002_layouts.down.sql`
- Create: `backend/internal/domain/layout.go`
- Create: `backend/internal/storage/postgres/layouts.go`
- Test: `backend/internal/storage/postgres/layouts_integration_test.go`

**Interfaces:**
- Consumes: `domain` package; `postgres.NewPool`, `RunMigrations`, `NewGraphRepo` (1A) — the test creates a graph first to satisfy the FK.
- Produces:
  - `domain.Position{ X, Y float64 }`, `domain.Viewport{ X, Y, Zoom float64 }`.
  - `domain.Layout{ ID, GraphID, Name string; Positions map[string]Position; Viewport Viewport; CreatedAt time.Time }`.
  - `postgres.NewLayoutRepo(pool) *LayoutRepo` with:
    - `SaveLayout(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error)` — upsert on `(graph_id, name)`.
    - `ListLayouts(ctx, graphID string) ([]domain.Layout, error)`
    - `GetLayoutByName(ctx, graphID, name string) (domain.Layout, error)` — `domain.ErrNotFound` if absent.

- [ ] **Step 1: Write the failing integration test**

Create `backend/internal/storage/postgres/layouts_integration_test.go`:

```go
//go:build integration

package postgres

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLayoutRepo_SaveListGet(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t) // helper from graphs_integration_test.go
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	graphs := NewGraphRepo(pool)
	layouts := NewLayoutRepo(pool)

	g, err := graphs.CreateGraph(ctx, "g")
	require.NoError(t, err)

	pos := map[string]domain.Position{"n1": {X: 10, Y: 20}}
	vp := domain.Viewport{X: 1, Y: 2, Zoom: 1.5}

	saved, err := layouts.SaveLayout(ctx, g.ID, "default", pos, vp)
	require.NoError(t, err)
	assert.NotEmpty(t, saved.ID)
	assert.Equal(t, "default", saved.Name)

	// Upsert: same (graph, name) overwrites, keeps one row and the same id.
	pos2 := map[string]domain.Position{"n1": {X: 99, Y: 0}, "n2": {X: 5, Y: 5}}
	saved2, err := layouts.SaveLayout(ctx, g.ID, "default", pos2, vp)
	require.NoError(t, err)
	assert.Equal(t, saved.ID, saved2.ID)

	list, err := layouts.ListLayouts(ctx, g.ID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "default", list[0].Name)

	got, err := layouts.GetLayoutByName(ctx, g.ID, "default")
	require.NoError(t, err)
	assert.EqualValues(t, 99, got.Positions["n1"].X)
	assert.EqualValues(t, 5, got.Positions["n2"].Y)
	assert.EqualValues(t, 1.5, got.Viewport.Zoom)

	_, err = layouts.GetLayoutByName(ctx, g.ID, "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/ -run Layout`
Expected: FAIL — undefined `NewLayoutRepo`.

- [ ] **Step 3: Write the migration**

Create `backend/internal/storage/postgres/migrations/0002_layouts.up.sql`:

```sql
CREATE TABLE layouts (
    id         UUID PRIMARY KEY,
    graph_id   UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    positions  JSONB NOT NULL DEFAULT '{}'::jsonb,
    viewport   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (graph_id, name)
);
```

Create `backend/internal/storage/postgres/migrations/0002_layouts.down.sql`:

```sql
DROP TABLE layouts;
```

- [ ] **Step 4: Write the domain layout types**

Create `backend/internal/domain/layout.go`:

```go
package domain

import "time"

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type Layout struct {
	ID        string              `json:"id"`
	GraphID   string              `json:"graphId"`
	Name      string              `json:"name"`
	Positions map[string]Position `json:"positions"`
	Viewport  Viewport            `json:"viewport"`
	CreatedAt time.Time           `json:"createdAt"`
}
```

- [ ] **Step 5: Write the layout repository**

Create `backend/internal/storage/postgres/layouts.go`:

```go
package postgres

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LayoutRepo struct {
	pool *pgxpool.Pool
}

func NewLayoutRepo(pool *pgxpool.Pool) *LayoutRepo {
	return &LayoutRepo{pool: pool}
}

func (r *LayoutRepo) SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error) {
	posJSON, err := json.Marshal(positions)
	if err != nil {
		return domain.Layout{}, err
	}
	vpJSON, err := json.Marshal(vp)
	if err != nil {
		return domain.Layout{}, err
	}
	out := domain.Layout{GraphID: graphID, Name: name, Positions: positions, Viewport: vp}
	err = r.pool.QueryRow(ctx,
		`INSERT INTO layouts (id, graph_id, name, positions, viewport)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (graph_id, name)
		 DO UPDATE SET positions = EXCLUDED.positions, viewport = EXCLUDED.viewport
		 RETURNING id, created_at`,
		uuid.NewString(), graphID, name, posJSON, vpJSON,
	).Scan(&out.ID, &out.CreatedAt)
	if err != nil {
		return domain.Layout{}, err
	}
	return out, nil
}

func (r *LayoutRepo) ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, graph_id, name, positions, viewport, created_at
		 FROM layouts WHERE graph_id = $1 ORDER BY name`, graphID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Layout{}
	for rows.Next() {
		l, err := scanLayout(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *LayoutRepo) GetLayoutByName(ctx context.Context, graphID, name string) (domain.Layout, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, graph_id, name, positions, viewport, created_at
		 FROM layouts WHERE graph_id = $1 AND name = $2`, graphID, name)
	l, err := scanLayout(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Layout{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Layout{}, err
	}
	return l, nil
}

// rowScanner is satisfied by both pgx.Row and pgx.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanLayout(row rowScanner) (domain.Layout, error) {
	var l domain.Layout
	var posJSON, vpJSON []byte
	if err := row.Scan(&l.ID, &l.GraphID, &l.Name, &posJSON, &vpJSON, &l.CreatedAt); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(posJSON, &l.Positions); err != nil {
		return domain.Layout{}, err
	}
	if err := json.Unmarshal(vpJSON, &l.Viewport); err != nil {
		return domain.Layout{}, err
	}
	return l, nil
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/ -run Layout`
Expected: PASS (Docker required).

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(backend): layouts table and repository (jsonb positions, upsert per name)"
```

---

## Task 2: LayoutService, REST endpoints, router refactor

**Files:**
- Create: `backend/internal/service/layout.go`
- Test: `backend/internal/service/layout_test.go`
- Create: `backend/internal/httpapi/layouts.go`
- Test: `backend/internal/httpapi/layouts_test.go`
- Modify: `backend/internal/httpapi/router.go` (introduce `Deps`, add layout routes)
- Modify: `backend/internal/httpapi/graphs_test.go` (update `NewRouter` call sites)
- Modify: `backend/internal/httpapi/health_test.go` (update `NewRouter` call site)
- Modify: `backend/cmd/server/main.go` (wire `LayoutService`)

**Interfaces:**
- Produces:
  - `service.LayoutStore` (satisfied by `postgres.LayoutRepo`): `SaveLayout`, `ListLayouts`, `GetLayoutByName` (signatures as Task 1).
  - `service.GraphExistence` (satisfied by `postgres.GraphRepo`): `GetGraph(ctx, id) (domain.Graph, error)`.
  - `service.NewLayoutService(LayoutStore, GraphExistence) *LayoutService` with `SaveLayout(ctx, graphID, name, positions, vp) (domain.Layout, error)`, `ListLayouts(ctx, graphID) ([]domain.Layout, error)`, `GetLayout(ctx, graphID, name) (domain.Layout, error)`.
  - `httpapi.LayoutAPI` interface + `httpapi.Deps{ Graphs GraphAPI; Layouts LayoutAPI }`; new signature `NewRouter(d Deps) http.Handler`.
- Routes:
  - `GET /graphs/{id}/layouts` → 200 `[]domain.Layout`
  - `POST /graphs/{id}/layouts` `{ name, positions, viewport }` → 201 `domain.Layout` | 400 | 404
  - `GET /graphs/{id}/layouts/{name}` → 200 `domain.Layout` | 404

- [ ] **Step 1: Write the failing service test**

Create `backend/internal/service/layout_test.go`:

```go
package service

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubLayoutStore struct {
	saved  domain.Layout
	list   []domain.Layout
	byName domain.Layout
	getErr error
}

func (s *stubLayoutStore) SaveLayout(_ context.Context, graphID, name string, p map[string]domain.Position, vp domain.Viewport) (domain.Layout, error) {
	s.saved = domain.Layout{ID: "l1", GraphID: graphID, Name: name, Positions: p, Viewport: vp}
	return s.saved, nil
}
func (s *stubLayoutStore) ListLayouts(_ context.Context, _ string) ([]domain.Layout, error) {
	return s.list, nil
}
func (s *stubLayoutStore) GetLayoutByName(_ context.Context, _, _ string) (domain.Layout, error) {
	return s.byName, s.getErr
}

type stubGraphExistence struct{ err error }

func (s *stubGraphExistence) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return domain.Graph{ID: "g1"}, s.err
}

func TestLayoutService_SaveEmptyName(t *testing.T) {
	svc := NewLayoutService(&stubLayoutStore{}, &stubGraphExistence{})
	_, err := svc.SaveLayout(context.Background(), "g1", " ", nil, domain.Viewport{})
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestLayoutService_SaveUnknownGraph(t *testing.T) {
	svc := NewLayoutService(&stubLayoutStore{}, &stubGraphExistence{err: domain.ErrNotFound})
	_, err := svc.SaveLayout(context.Background(), "gX", "default", nil, domain.Viewport{})
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestLayoutService_SaveOK(t *testing.T) {
	store := &stubLayoutStore{}
	svc := NewLayoutService(store, &stubGraphExistence{})
	l, err := svc.SaveLayout(context.Background(), "g1", "default",
		map[string]domain.Position{"n1": {X: 1, Y: 2}}, domain.Viewport{Zoom: 1})
	require.NoError(t, err)
	assert.Equal(t, "default", l.Name)
	assert.EqualValues(t, 1, store.saved.Positions["n1"].X)
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && go test ./internal/service/ -run Layout`
Expected: FAIL — undefined `NewLayoutService`.

- [ ] **Step 3: Write the LayoutService**

Create `backend/internal/service/layout.go`:

```go
package service

import (
	"context"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

type LayoutStore interface {
	SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error)
	ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error)
	GetLayoutByName(ctx context.Context, graphID, name string) (domain.Layout, error)
}

type GraphExistence interface {
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
}

type LayoutService struct {
	store  LayoutStore
	graphs GraphExistence
}

func NewLayoutService(store LayoutStore, graphs GraphExistence) *LayoutService {
	return &LayoutService{store: store, graphs: graphs}
}

func (s *LayoutService) SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Layout{}, ErrInvalidInput
	}
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return domain.Layout{}, err
	}
	if positions == nil {
		positions = map[string]domain.Position{}
	}
	return s.store.SaveLayout(ctx, graphID, name, positions, vp)
}

func (s *LayoutService) ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error) {
	if _, err := s.graphs.GetGraph(ctx, graphID); err != nil {
		return nil, err
	}
	return s.store.ListLayouts(ctx, graphID)
}

func (s *LayoutService) GetLayout(ctx context.Context, graphID, name string) (domain.Layout, error) {
	return s.store.GetLayoutByName(ctx, graphID, name)
}
```

- [ ] **Step 4: Run service test to verify it passes**

Run: `cd backend && go test ./internal/service/ -run Layout`
Expected: PASS.

- [ ] **Step 5: Write the failing handler test**

Create `backend/internal/httpapi/layouts_test.go`:

```go
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubLayoutAPI struct {
	list      []domain.Layout
	saved     domain.Layout
	saveErr   error
	byName    domain.Layout
	getErr    error
	gotName   string
	gotPosLen int
}

func (s *stubLayoutAPI) ListLayouts(_ context.Context, _ string) ([]domain.Layout, error) {
	return s.list, nil
}
func (s *stubLayoutAPI) SaveLayout(_ context.Context, _ string, name string, p map[string]domain.Position, _ domain.Viewport) (domain.Layout, error) {
	s.gotName = name
	s.gotPosLen = len(p)
	if s.saveErr != nil {
		return domain.Layout{}, s.saveErr
	}
	return s.saved, nil
}
func (s *stubLayoutAPI) GetLayout(_ context.Context, _, _ string) (domain.Layout, error) {
	return s.byName, s.getErr
}

func routerWithLayouts(l LayoutAPI) http.Handler {
	return NewRouter(Deps{Graphs: &stubAPI{}, Layouts: l})
}

func TestListLayouts_200(t *testing.T) {
	l := &stubLayoutAPI{list: []domain.Layout{{ID: "l1", Name: "default"}}}
	rec := doReq(t, routerWithLayouts(l), http.MethodGet, "/graphs/g1/layouts", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var out []domain.Layout
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Len(t, out, 1)
}

func TestSaveLayout_201(t *testing.T) {
	l := &stubLayoutAPI{saved: domain.Layout{ID: "l1", Name: "default"}}
	body := `{"name":"default","positions":{"n1":{"x":10,"y":20}},"viewport":{"x":0,"y":0,"zoom":1}}`
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", body)
	require.Equal(t, http.StatusCreated, rec.Code)
	assert.Equal(t, "default", l.gotName)
	assert.Equal(t, 1, l.gotPosLen)
}

func TestSaveLayout_400OnInvalid(t *testing.T) {
	l := &stubLayoutAPI{saveErr: service.ErrInvalidInput}
	rec := doReq(t, routerWithLayouts(l), http.MethodPost, "/graphs/g1/layouts", `{"name":""}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetLayout_404(t *testing.T) {
	l := &stubLayoutAPI{getErr: domain.ErrNotFound}
	rec := doReq(t, routerWithLayouts(l), http.MethodGet, "/graphs/g1/layouts/missing", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)
}
```

- [ ] **Step 6: Write the layout handlers**

Create `backend/internal/httpapi/layouts.go`:

```go
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/go-chi/chi/v5"
)

type LayoutAPI interface {
	ListLayouts(ctx context.Context, graphID string) ([]domain.Layout, error)
	SaveLayout(ctx context.Context, graphID, name string, positions map[string]domain.Position, vp domain.Viewport) (domain.Layout, error)
	GetLayout(ctx context.Context, graphID, name string) (domain.Layout, error)
}

func handleListLayouts(api LayoutAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ls, err := api.ListLayouts(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, ls)
	}
}

func handleSaveLayout(api LayoutAPI) http.HandlerFunc {
	type request struct {
		Name      string                     `json:"name"`
		Positions map[string]domain.Position `json:"positions"`
		Viewport  domain.Viewport            `json:"viewport"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		l, err := api.SaveLayout(r.Context(), chi.URLParam(r, "id"), req.Name, req.Positions, req.Viewport)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, l)
	}
}

func handleGetLayout(api LayoutAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l, err := api.GetLayout(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "name"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, l)
	}
}
```

- [ ] **Step 7: Refactor the router to `Deps` and add layout routes**

Replace `backend/internal/httpapi/router.go` with:

```go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Deps struct {
	Graphs  GraphAPI
	Layouts LayoutAPI
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", handleHealth)
	r.Route("/graphs", func(r chi.Router) {
		r.Post("/", handleCreateGraph(d.Graphs))
		r.Get("/{id}", handleGetGraph(d.Graphs))
		r.Get("/{id}/subgraph", handleGetSubgraph(d.Graphs))
		r.Post("/{id}/mutations", handleApplyMutations(d.Graphs))
		r.Get("/{id}/layouts", handleListLayouts(d.Layouts))
		r.Post("/{id}/layouts", handleSaveLayout(d.Layouts))
		r.Get("/{id}/layouts/{name}", handleGetLayout(d.Layouts))
	})
	return r
}
```

- [ ] **Step 8: Update the 1B call sites**

In `backend/internal/httpapi/graphs_test.go`, replace every `NewRouter(api)` with `NewRouter(Deps{Graphs: api})`.
In `backend/internal/httpapi/health_test.go`, replace `NewRouter(nil)` with `NewRouter(Deps{})`.

- [ ] **Step 9: Wire LayoutService in main.go**

In `backend/cmd/server/main.go`, after the `svc := service.NewGraphService(...)` block, add the layout wiring and pass both into the router. Replace the service+router section with:

```go
	graphRepo := pgstore.NewGraphRepo(pool)
	svc := service.NewGraphService(graphRepo, neo4jstore.NewElementRepo(driver))
	layoutSvc := service.NewLayoutService(pgstore.NewLayoutRepo(pool), graphRepo)

	router := httpapi.NewRouter(httpapi.Deps{Graphs: svc, Layouts: layoutSvc})

	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, router); err != nil {
		log.Fatalf("server: %v", err)
	}
```

- [ ] **Step 10: Run all backend tests, build, vet; commit**

Run: `cd backend && go test ./... && go build ./... && go vet ./...`
Expected: all unit tests PASS; build/vet clean.

```bash
git add backend
git commit -m "feat(backend): layout service and REST endpoints; router Deps refactor"
```

---

## Task 3: `useGraph` hook — live load and drag state

**Files:**
- Create: `frontend/src/graph/useGraph.ts`
- Test: `frontend/src/graph/useGraph.test.tsx`

**Interfaces:**
- Consumes: `ApiClient` (1C), `TypeStyleMap`, `toFlowNodes`/`toFlowEdges`/`TypedNodeData` (1C); React Flow `applyNodeChanges`, `Node`, `Edge`, `NodeChange`.
- Produces: `useGraph(client, graphId, styles) => { nodes, edges, version, error, reload(positions?), onNodesChange(changes), setVersion(v) }`. `reload` fetches graph + subgraph, seeds React Flow state, and stores the version; `onNodesChange` applies drag/position changes locally.

- [ ] **Step 1: Write the failing hook test**

Create `frontend/src/graph/useGraph.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./useGraph`.

- [ ] **Step 3: Write the hook**

Create `frontend/src/graph/useGraph.ts`:

```ts
import { useCallback, useState } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedNodeData } from './toFlow'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  edges: Edge[]
  version: number
  error: string | null
  reload: (positions?: PositionMap) => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  setVersion: (v: number) => void
}

export function useGraph(client: ApiClient, graphId: string, styles: TypeStyleMap): UseGraph {
  const [nodes, setNodes] = useState<Node<TypedNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (positions?: PositionMap) => {
      try {
        const [graph, sg] = await Promise.all([
          client.getGraph(graphId),
          client.getSubgraph(graphId),
        ])
        setVersion(graph.version)
        setNodes(toFlowNodes(sg, styles, positions))
        setEdges(toFlowEdges(sg, styles))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    },
    [client, graphId, styles],
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Node<TypedNodeData>[])
  }, [])

  return { nodes, edges, version, error, reload, onNodesChange, setVersion }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): useGraph hook for live load and drag state"
```

---

## Task 4: Layout client methods, `extractPositions`, save/load bar

**Files:**
- Modify: `frontend/src/api/types.ts` (add `Position`, `Viewport`, `Layout`)
- Modify: `frontend/src/api/client.ts` (add `listLayouts`, `saveLayout`, `getLayout`)
- Create: `frontend/src/graph/layout.ts`
- Create: `frontend/src/graph/LayoutBar.tsx`
- Test: `frontend/src/graph/layout.test.ts`
- Test: `frontend/src/graph/LayoutBar.test.tsx`

**Interfaces:**
- Produces:
  - Types `Position{x,y}`, `Viewport{x,y,zoom}`, `Layout{id,graphId,name,positions,viewport,createdAt}`.
  - Client methods `listLayouts(id) => Promise<Layout[]>`, `saveLayout(id,name,positions,viewport) => Promise<Layout>`, `getLayout(id,name) => Promise<Layout>`.
  - `extractPositions(nodes: Node[]) => Record<string,{x,y}>`.
  - `LayoutBar({ layouts, onSave, onLoad })` — text input + Save button (calls `onSave(name)`), and one Load button per layout (calls `onLoad(name)`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/graph/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractPositions } from './layout'
import type { Node } from '@xyflow/react'

describe('extractPositions', () => {
  it('maps node id to its position', () => {
    const nodes = [
      { id: 'a', position: { x: 1, y: 2 } },
      { id: 'b', position: { x: 3, y: 4 } },
    ] as Node[]
    expect(extractPositions(nodes)).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } })
  })
})
```

Create `frontend/src/graph/LayoutBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayoutBar } from './LayoutBar'
import type { Layout } from '../api/types'

const layouts: Layout[] = [
  { id: 'l1', graphId: 'g1', name: 'default', positions: {}, viewport: { x: 0, y: 0, zoom: 1 }, createdAt: '' },
]

describe('LayoutBar', () => {
  it('calls onSave with the typed name', () => {
    const onSave = vi.fn()
    render(<LayoutBar layouts={[]} onSave={onSave} onLoad={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('layout name'), { target: { value: 'v2' } })
    fireEvent.click(screen.getByText('Save layout'))
    expect(onSave).toHaveBeenCalledWith('v2')
  })

  it('calls onLoad when a saved layout is clicked', () => {
    const onLoad = vi.fn()
    render(<LayoutBar layouts={layouts} onSave={vi.fn()} onLoad={onLoad} />)
    fireEvent.click(screen.getByText('default'))
    expect(onLoad).toHaveBeenCalledWith('default')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./layout` / `./LayoutBar`.

- [ ] **Step 3: Extend API types**

Append to `frontend/src/api/types.ts`:

```ts
export interface Position {
  x: number
  y: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Layout {
  id: string
  graphId: string
  name: string
  positions: Record<string, Position>
  viewport: Viewport
  createdAt: string
}
```

- [ ] **Step 4: Extend the client**

In `frontend/src/api/client.ts`, add `Layout`, `Position`, `Viewport` to the type import, and add these three methods inside the object returned by `createClient`:

```ts
    listLayouts: (id: string) => request<Layout[]>(`${baseURL}/graphs/${id}/layouts`),
    saveLayout: (id: string, name: string, positions: Record<string, Position>, viewport: Viewport) =>
      request<Layout>(`${baseURL}/graphs/${id}/layouts`, {
        method: 'POST',
        body: JSON.stringify({ name, positions, viewport }),
      }),
    getLayout: (id: string, name: string) =>
      request<Layout>(`${baseURL}/graphs/${id}/layouts/${encodeURIComponent(name)}`),
```

The updated import line at the top of `client.ts`:

```ts
import type { Graph, Subgraph, Mutations, Layout, Position, Viewport } from './types'
```

- [ ] **Step 5: Write `extractPositions`**

Create `frontend/src/graph/layout.ts`:

```ts
import type { Node } from '@xyflow/react'

export function extractPositions(nodes: Node[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    out[n.id] = { x: n.position.x, y: n.position.y }
  }
  return out
}
```

- [ ] **Step 6: Write `LayoutBar`**

Create `frontend/src/graph/LayoutBar.tsx`:

```tsx
import { useState } from 'react'
import type { Layout } from '../api/types'

export interface LayoutBarProps {
  layouts: Layout[]
  onSave: (name: string) => void
  onLoad: (name: string) => void
}

export function LayoutBar({ layouts, onSave, onLoad }: LayoutBarProps) {
  const [name, setName] = useState('default')
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
      <input
        placeholder="layout name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button onClick={() => onSave(name)}>Save layout</button>
      {layouts.map((l) => (
        <button key={l.id} onClick={() => onLoad(l.name)}>
          {l.name}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd frontend && npm test && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "feat(frontend): layout client methods, extractPositions, save/load bar"
```

---

## Task 5: Editing with optimistic version + conflict handling; GraphEditor

**Files:**
- Create: `frontend/src/graph/commit.ts`
- Test: `frontend/src/graph/commit.test.ts`
- Modify: `frontend/src/graph/GraphCanvas.tsx` (accept `onNodesChange` so nodes are draggable)
- Create: `frontend/src/graph/GraphEditor.tsx`
- Test: `frontend/src/graph/GraphEditor.test.tsx`
- Modify: `frontend/src/App.tsx` (render `GraphEditor` for `?graph=<id>`)

**Interfaces:**
- Consumes: `ApiClient`, `ApiError`, `Mutations`, `useGraph`, `GraphCanvas`, `LayoutBar`, `extractPositions`, `TypeStyleMap`.
- Produces:
  - `commitMutation(client, graphId, version, m) => Promise<{ version: number; conflict: boolean }>` — a 409 returns `{ version (unchanged), conflict: true }`; other errors rethrow.
  - `newNodeMutation(type) => Mutations` — one upsert of a fresh-UUID node.
  - `GraphCanvasProps` gains `onNodesChange?: (changes: NodeChange[]) => void`.
  - `GraphEditor({ client, graphId, styles })` — loads on mount, "Add Task" button, save/load layout bar, conflict notice.

- [ ] **Step 1: Write the failing commit test**

Create `frontend/src/graph/commit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { commitMutation } from './commit'
import { ApiError } from '../api/client'
import type { ApiClient } from '../api/client'

function clientWith(applyMutations: unknown): ApiClient {
  return { applyMutations } as unknown as ApiClient
}

describe('commitMutation', () => {
  it('returns the new version on success', async () => {
    const client = clientWith(vi.fn().mockResolvedValue({ version: 8 }))
    const res = await commitMutation(client, 'g1', 7, { upsertNodes: [] })
    expect(res).toEqual({ version: 8, conflict: false })
  })

  it('maps 409 to a conflict, keeping the old version', async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new ApiError(409, 'version conflict')))
    const res = await commitMutation(client, 'g1', 7, {})
    expect(res).toEqual({ version: 7, conflict: true })
  })

  it('rethrows non-409 errors', async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new ApiError(500, 'boom')))
    await expect(commitMutation(client, 'g1', 7, {})).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `./commit`.

- [ ] **Step 3: Write the commit helper**

Create `frontend/src/graph/commit.ts`:

```ts
import { ApiError, type ApiClient } from '../api/client'
import type { Mutations } from '../api/types'

export interface CommitResult {
  version: number
  conflict: boolean
}

export async function commitMutation(
  client: ApiClient,
  graphId: string,
  version: number,
  m: Mutations,
): Promise<CommitResult> {
  try {
    const r = await client.applyMutations(graphId, version, m)
    return { version: r.version, conflict: false }
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return { version, conflict: true }
    }
    throw e
  }
}

export function newNodeMutation(type: string): Mutations {
  return { upsertNodes: [{ id: crypto.randomUUID(), type, properties: {} }] }
}
```

- [ ] **Step 4: Run the commit test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Make GraphCanvas draggable**

Replace `frontend/src/graph/GraphCanvas.tsx` with (adds the optional `onNodesChange` prop; React Flow only enables node dragging when a change handler is supplied):

```tsx
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TypedNode } from './TypedNode'

const nodeTypes = { typed: TypedNode }

export interface GraphCanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange?: (changes: NodeChange[]) => void
}

export function GraphCanvas({ nodes, edges, onNodesChange }: GraphCanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }} data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 6: Write the failing GraphEditor smoke test**

Create `frontend/src/graph/GraphEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GraphEditor } from './GraphEditor'
import type { ApiClient } from '../api/client'

function fakeClient(): ApiClient {
  return {
    getGraph: vi.fn().mockResolvedValue({ id: 'g1', name: 'g', version: 1, createdAt: '' }),
    getSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    listLayouts: vi.fn().mockResolvedValue([]),
    saveLayout: vi.fn(),
    getLayout: vi.fn(),
    createGraph: vi.fn(),
    applyMutations: vi.fn(),
  } as unknown as ApiClient
}

describe('GraphEditor', () => {
  it('mounts, loads, and shows the toolbar and canvas', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByText('Add Task')).toBeInTheDocument())
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.getByText('Save layout')).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Write the GraphEditor**

Create `frontend/src/graph/GraphEditor.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../api/client'
import type { Layout } from '../api/types'
import { GraphCanvas } from './GraphCanvas'
import { LayoutBar } from './LayoutBar'
import { useGraph } from './useGraph'
import { extractPositions } from './layout'
import { commitMutation, newNodeMutation } from './commit'
import type { TypeStyleMap } from './typeStyle'

export interface GraphEditorProps {
  client: ApiClient
  graphId: string
  styles: TypeStyleMap
}

export function GraphEditor({ client, graphId, styles }: GraphEditorProps) {
  const { nodes, edges, version, error, reload, onNodesChange, setVersion } = useGraph(
    client,
    graphId,
    styles,
  )
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const refreshLayouts = useCallback(async () => {
    setLayouts(await client.listLayouts(graphId))
  }, [client, graphId])

  useEffect(() => {
    void reload()
    void refreshLayouts()
  }, [reload, refreshLayouts])

  const addNode = useCallback(async () => {
    const res = await commitMutation(client, graphId, version, newNodeMutation('Task'))
    if (res.conflict) {
      setNotice('Someone else changed this graph — reloaded the latest version.')
    } else {
      setVersion(res.version)
      setNotice(null)
    }
    await reload(extractPositions(nodes))
  }, [client, graphId, version, nodes, reload, setVersion])

  const onSaveLayout = useCallback(
    async (name: string) => {
      await client.saveLayout(graphId, name, extractPositions(nodes), { x: 0, y: 0, zoom: 1 })
      await refreshLayouts()
    },
    [client, graphId, nodes, refreshLayouts],
  )

  const onLoadLayout = useCallback(
    async (name: string) => {
      const l = await client.getLayout(graphId, name)
      await reload(l.positions)
    },
    [client, graphId, reload],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd' }}>
        <button onClick={() => void addNode()}>Add Task</button>
        <LayoutBar
          layouts={layouts}
          onSave={(n) => void onSaveLayout(n)}
          onLoad={(n) => void onLoadLayout(n)}
        />
        {error && <span style={{ color: 'red' }}>{error}</span>}
        {notice && <span style={{ color: '#a60' }}>{notice}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <GraphCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Wire App to GraphEditor**

Replace `frontend/src/App.tsx` with:

```tsx
import { createClient } from './api/client'
import { GraphEditor } from './graph/GraphEditor'
import type { TypeStyleMap } from './graph/typeStyle'

const client = createClient(import.meta.env.VITE_API_URL ?? 'http://localhost:8080')

const styles: TypeStyleMap = {
  Task: { shape: 'rectangle', color: '#3366cc' },
  Milestone: { shape: 'diamond', color: '#cc6633' },
  depends_on: { shape: 'rectangle', color: '#888888' },
}

const graphId = new URLSearchParams(window.location.search).get('graph') ?? ''

export default function App() {
  if (!graphId) {
    return <div style={{ padding: 20 }}>Append ?graph=&lt;id&gt; to the URL to open a graph.</div>
  }
  return <GraphEditor client={client} graphId={graphId} styles={styles} />
}
```

- [ ] **Step 9: Run tests, typecheck, build**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run build`
Expected: all tests PASS; no type errors; build succeeds.

- [ ] **Step 10: Manual end-to-end check (full stack up)**

With backend running (1B smoke) and a graph created, run `npm run dev`, open `<url>?graph=<id>`:
- click **Add Task** → a node appears; the graph version advances.
- drag the node; click **Save layout** (name `default`).
- reload the page → node returns to the saved position (no re-layout).
- in a second tab, add a node; back in the first tab click **Add Task** with the now-stale version → the conflict notice shows and the canvas reloads the latest.

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "feat(frontend): node creation with optimistic version, 409 handling, graph editor"
```

---

## Self-Review (slice 1D)

**Spec coverage (against §6.3 layouts, §7 concurrency, §8 API, and the original requirements 13/14):**
- Manual node dragging → `GraphCanvas` `onNodesChange` + `useGraph` (Tasks 3, 5). ✓ (req. 13)
- Save a specific layout; restore on load without re-layout → layouts store/API (Tasks 1, 2) + `extractPositions`/save/load (Tasks 4, 5). ✓ (req. 14, §6.3 multiple named layouts)
- Multiple named layouts per graph → unique `(graph_id, name)`, list endpoint, bar (Tasks 1, 2, 4). ✓
- Layout writes don't bump graph version → layouts path never calls `BumpVersion` (§7). ✓
- Create/delete via mutations under `baseVersion`; 409 → reload → notice → `commitMutation` + `GraphEditor` (Task 5). ✓ (§7; delete edges/nodes API already exists from 1B `Mutations` and is reachable via the same `commitMutation`)

**Placeholder scan:** none — every step has runnable code/commands.

**Type consistency:** `domain.Position`/`Viewport`/`Layout` (backend, Task 1) mirror `Position`/`Viewport`/`Layout` (frontend, Task 4) field-for-field (`x`,`y`,`zoom`,`positions`,`viewport`,`createdAt`). `LayoutAPI`/`LayoutStore`/`GraphExistence` method signatures match across service, handlers, stubs, and the `LayoutRepo`. Router `Deps{Graphs,Layouts}` is used consistently in `main.go`, the 1B test edits (Task 2 Step 8), and the layout handler tests.

**Documented phase-1 simplifications (intentional):**
- Viewport is persisted as a default `{0,0,1}`; capturing the live viewport on save is deferred polish — position restoration (the core "не располагать граф повторно" requirement) is fully implemented.
- Delete uses the existing `Mutations` fields; a dedicated delete-selected toolbar button is a trivial follow-up on top of `commitMutation` and is not separately tested here.

---

## Phase 1 — plan set complete

All four slices are planned:
- **1A** `2026-07-24-phase-1a-backend-foundation.md` — scaffolding + Neo4j/Postgres storage.
- **1B** `2026-07-24-phase-1b-graph-api.md` — graph service + CRUD API.
- **1C** `2026-07-24-phase-1c-frontend-canvas.md` — React Flow canvas + type styling.
- **1D** `2026-07-24-phase-1d-interaction.md` — live load, drag, named layouts, editing, 409.

Together they deliver the design's **Phase 1 "Ядро"** result: a working typed-graph editor. Suggested execution order: 1A → 1B → 1C → 1D (1C can start in parallel with 1B once the API shapes in 1B Task 2 are fixed).




