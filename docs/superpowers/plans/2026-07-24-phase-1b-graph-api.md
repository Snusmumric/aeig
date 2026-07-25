# Phase 1B — Graph Domain Service & CRUD API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a REST API over the 1A storage layer so a client can create graphs, read a graph and its subgraph, and apply batched node/edge mutations under optimistic version control (HTTP 409 on stale writes).

**Architecture:** A `GraphService` composes the Postgres `GraphRepo` (registry + version) and the Neo4j `ElementRepo` (elements) behind two small interfaces, so it is unit-testable with stubs. HTTP handlers depend on a `GraphAPI` interface (satisfied by `GraphService`) and are unit-tested with a stub — no database needed in this slice; the real database behavior is already covered by 1A integration tests. `main.go` wires the concrete repos, runs migrations, and starts the server.

**Tech Stack:** Go 1.22+, `github.com/go-chi/chi/v5`, `encoding/json`, `github.com/stretchr/testify`. Builds on slice 1A (`domain`, `storage/postgres`, `storage/neo4j`, `config`, `httpapi`).

## Global Constraints

- Go module path: `github.com/aeig/backend` (same as 1A).
- Optimistic concurrency: every mutating request carries `baseVersion`; the service bumps the Postgres version **first** (atomic guard), then applies Neo4j writes. This is intentionally **not** a distributed transaction in phase 1 — if a Neo4j write fails after the version bump, the API returns 500 and the client re-fetches the subgraph (Neo4j is the source of truth for elements). Document this in the handler comment.
- Domain-error → HTTP mapping is centralized: `domain.ErrNotFound`→404, `domain.ErrVersionConflict`→409, invalid input→400, anything else→500.
- All request/response bodies are JSON; all IDs are the UUID strings created in 1A.

---

## Task 1: Mutations type and GraphService

**Files:**
- Create: `backend/internal/domain/mutations.go`
- Create: `backend/internal/service/graph.go`
- Test: `backend/internal/service/graph_test.go`

**Interfaces:**
- Consumes (from 1A): `domain.Graph`, `domain.Node`, `domain.Edge`, `domain.Subgraph`, `domain.ErrNotFound`, `domain.ErrVersionConflict`.
- Produces:
  - `domain.Mutations{ UpsertNodes []Node; UpsertEdges []Edge; DeleteNodeIDs []string; DeleteEdgeIDs []string }`.
  - `service.GraphStore` interface: `CreateGraph(ctx, name) (domain.Graph, error)`, `GetGraph(ctx, id) (domain.Graph, error)`, `BumpVersion(ctx, id, base) (int64, error)` — satisfied by `postgres.GraphRepo`.
  - `service.ElementStore` interface: `UpsertNode(ctx, graphID, domain.Node) error`, `UpsertEdge(ctx, graphID, domain.Edge) error`, `DeleteNode(ctx, graphID, id) error`, `DeleteEdge(ctx, graphID, id) error`, `GetSubgraph(ctx, graphID) (domain.Subgraph, error)` — satisfied by `neo4j.ElementRepo`.
  - `service.NewGraphService(GraphStore, ElementStore) *GraphService` with methods:
    - `CreateGraph(ctx, name string) (domain.Graph, error)` — 400-worthy `ErrInvalidInput` if name empty.
    - `GetGraph(ctx, id string) (domain.Graph, error)`
    - `GetSubgraph(ctx, id string) (domain.Subgraph, error)` — `ErrNotFound` if graph absent.
    - `ApplyMutations(ctx, id string, baseVersion int64, m domain.Mutations) (int64, error)`
  - `service.ErrInvalidInput` sentinel.

- [ ] **Step 1: Write the failing service test**

Create `backend/internal/service/graph_test.go`:

```go
package service

import (
	"context"
	"errors"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubGraphStore struct {
	graph      domain.Graph
	getErr     error
	bumpErr    error
	bumpedBase int64
	newVersion int64
}

func (s *stubGraphStore) CreateGraph(_ context.Context, name string) (domain.Graph, error) {
	return domain.Graph{ID: "g1", Name: name, Version: 1}, nil
}
func (s *stubGraphStore) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return s.graph, s.getErr
}
func (s *stubGraphStore) BumpVersion(_ context.Context, _ string, base int64) (int64, error) {
	s.bumpedBase = base
	return s.newVersion, s.bumpErr
}

type stubElementStore struct {
	upsertedNodes []domain.Node
	upsertedEdges []domain.Edge
	deletedNodes  []string
	deletedEdges  []string
	sub           domain.Subgraph
	upsertNodeErr error
}

func (s *stubElementStore) UpsertNode(_ context.Context, _ string, n domain.Node) error {
	s.upsertedNodes = append(s.upsertedNodes, n)
	return s.upsertNodeErr
}
func (s *stubElementStore) UpsertEdge(_ context.Context, _ string, e domain.Edge) error {
	s.upsertedEdges = append(s.upsertedEdges, e)
	return nil
}
func (s *stubElementStore) DeleteNode(_ context.Context, _ string, id string) error {
	s.deletedNodes = append(s.deletedNodes, id)
	return nil
}
func (s *stubElementStore) DeleteEdge(_ context.Context, _ string, id string) error {
	s.deletedEdges = append(s.deletedEdges, id)
	return nil
}
func (s *stubElementStore) GetSubgraph(_ context.Context, _ string) (domain.Subgraph, error) {
	return s.sub, nil
}

func TestCreateGraph_EmptyName(t *testing.T) {
	svc := NewGraphService(&stubGraphStore{}, &stubElementStore{})
	_, err := svc.CreateGraph(context.Background(), "  ")
	assert.ErrorIs(t, err, ErrInvalidInput)
}

func TestGetSubgraph_NotFound(t *testing.T) {
	gs := &stubGraphStore{getErr: domain.ErrNotFound}
	svc := NewGraphService(gs, &stubElementStore{})
	_, err := svc.GetSubgraph(context.Background(), "missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestApplyMutations_BumpsFirstThenApplies(t *testing.T) {
	gs := &stubGraphStore{newVersion: 5}
	es := &stubElementStore{}
	svc := NewGraphService(gs, es)

	m := domain.Mutations{
		UpsertNodes:   []domain.Node{{ID: "n1", Type: "Task"}},
		UpsertEdges:   []domain.Edge{{ID: "e1", Type: "rel", Source: "n1", Target: "n2"}},
		DeleteEdgeIDs: []string{"eOld"},
		DeleteNodeIDs: []string{"nOld"},
	}
	v, err := svc.ApplyMutations(context.Background(), "g1", 4, m)
	require.NoError(t, err)
	assert.Equal(t, int64(5), v)
	assert.Equal(t, int64(4), gs.bumpedBase)
	assert.Equal(t, []string{"n1"}, nodeIDs(es.upsertedNodes))
	assert.Equal(t, []string{"e1"}, edgeIDs(es.upsertedEdges))
	assert.Equal(t, []string{"eOld"}, es.deletedEdges)
	assert.Equal(t, []string{"nOld"}, es.deletedNodes)
}

func TestApplyMutations_VersionConflict_NoElementWrites(t *testing.T) {
	gs := &stubGraphStore{bumpErr: domain.ErrVersionConflict}
	es := &stubElementStore{}
	svc := NewGraphService(gs, es)

	_, err := svc.ApplyMutations(context.Background(), "g1", 2,
		domain.Mutations{UpsertNodes: []domain.Node{{ID: "n1"}}})
	assert.ErrorIs(t, err, domain.ErrVersionConflict)
	assert.Empty(t, es.upsertedNodes, "no element writes on conflict")
}

func TestApplyMutations_ElementErrorPropagates(t *testing.T) {
	gs := &stubGraphStore{newVersion: 3}
	es := &stubElementStore{upsertNodeErr: errors.New("neo4j down")}
	svc := NewGraphService(gs, es)
	_, err := svc.ApplyMutations(context.Background(), "g1", 2,
		domain.Mutations{UpsertNodes: []domain.Node{{ID: "n1"}}})
	require.Error(t, err)
	assert.NotErrorIs(t, err, domain.ErrVersionConflict)
}

func nodeIDs(ns []domain.Node) []string {
	out := []string{}
	for _, n := range ns {
		out = append(out, n.ID)
	}
	return out
}
func edgeIDs(es []domain.Edge) []string {
	out := []string{}
	for _, e := range es {
		out = append(out, e.ID)
	}
	return out
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/service/`
Expected: FAIL — undefined `NewGraphService`, `ErrInvalidInput`, `domain.Mutations`.

- [ ] **Step 3: Write the Mutations type**

Create `backend/internal/domain/mutations.go`:

```go
package domain

type Mutations struct {
	UpsertNodes   []Node   `json:"upsertNodes"`
	UpsertEdges   []Edge   `json:"upsertEdges"`
	DeleteNodeIDs []string `json:"deleteNodeIds"`
	DeleteEdgeIDs []string `json:"deleteEdgeIds"`
}
```

- [ ] **Step 4: Write the GraphService**

Create `backend/internal/service/graph.go`:

```go
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/aeig/backend/internal/domain"
)

var ErrInvalidInput = errors.New("invalid input")

type GraphStore interface {
	CreateGraph(ctx context.Context, name string) (domain.Graph, error)
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
	BumpVersion(ctx context.Context, id string, baseVersion int64) (int64, error)
}

type ElementStore interface {
	UpsertNode(ctx context.Context, graphID string, n domain.Node) error
	UpsertEdge(ctx context.Context, graphID string, e domain.Edge) error
	DeleteNode(ctx context.Context, graphID, nodeID string) error
	DeleteEdge(ctx context.Context, graphID, edgeID string) error
	GetSubgraph(ctx context.Context, graphID string) (domain.Subgraph, error)
}

type GraphService struct {
	graphs   GraphStore
	elements ElementStore
}

func NewGraphService(g GraphStore, e ElementStore) *GraphService {
	return &GraphService{graphs: g, elements: e}
}

func (s *GraphService) CreateGraph(ctx context.Context, name string) (domain.Graph, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Graph{}, ErrInvalidInput
	}
	return s.graphs.CreateGraph(ctx, name)
}

func (s *GraphService) GetGraph(ctx context.Context, id string) (domain.Graph, error) {
	return s.graphs.GetGraph(ctx, id)
}

func (s *GraphService) GetSubgraph(ctx context.Context, id string) (domain.Subgraph, error) {
	if _, err := s.graphs.GetGraph(ctx, id); err != nil {
		return domain.Subgraph{}, err
	}
	return s.elements.GetSubgraph(ctx, id)
}

// ApplyMutations bumps the version first (atomic optimistic guard); on success it
// applies element writes in dependency-safe order. Not a distributed transaction:
// a Neo4j failure after the bump surfaces as a non-domain error (HTTP 500) and the
// client must re-fetch the subgraph.
func (s *GraphService) ApplyMutations(ctx context.Context, id string, baseVersion int64, m domain.Mutations) (int64, error) {
	newVersion, err := s.graphs.BumpVersion(ctx, id, baseVersion)
	if err != nil {
		return 0, err // ErrNotFound / ErrVersionConflict propagate unchanged
	}
	for _, n := range m.UpsertNodes {
		if err := s.elements.UpsertNode(ctx, id, n); err != nil {
			return 0, err
		}
	}
	for _, e := range m.UpsertEdges {
		if err := s.elements.UpsertEdge(ctx, id, e); err != nil {
			return 0, err
		}
	}
	for _, eid := range m.DeleteEdgeIDs {
		if err := s.elements.DeleteEdge(ctx, id, eid); err != nil {
			return 0, err
		}
	}
	for _, nid := range m.DeleteNodeIDs {
		if err := s.elements.DeleteNode(ctx, id, nid); err != nil {
			return 0, err
		}
	}
	return newVersion, nil
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && go test ./internal/service/`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(backend): graph service composing postgres+neo4j with optimistic mutations"
```

---

## Task 2: REST handlers, router wiring, error mapping

**Files:**
- Create: `backend/internal/httpapi/graphs.go`
- Create: `backend/internal/httpapi/respond.go`
- Modify: `backend/internal/httpapi/router.go` (change `NewRouter` signature to accept a `GraphAPI`)
- Modify: `backend/internal/httpapi/health_test.go` (pass `nil` to `NewRouter`)
- Test: `backend/internal/httpapi/graphs_test.go`

**Interfaces:**
- Consumes: `service.ErrInvalidInput`, `domain.*` types and sentinels.
- Produces:
  - `httpapi.GraphAPI` interface: `CreateGraph(ctx, name) (domain.Graph, error)`, `GetGraph(ctx, id) (domain.Graph, error)`, `GetSubgraph(ctx, id) (domain.Subgraph, error)`, `ApplyMutations(ctx, id, baseVersion, domain.Mutations) (int64, error)` — satisfied by `*service.GraphService`.
  - New signature `httpapi.NewRouter(api GraphAPI) http.Handler`.
- Routes:
  - `POST /graphs` `{ "name": string }` → 201 `domain.Graph`
  - `GET /graphs/{id}` → 200 `domain.Graph` | 404
  - `GET /graphs/{id}/subgraph` → 200 `domain.Subgraph` | 404
  - `POST /graphs/{id}/mutations` `{ baseVersion, upsertNodes, upsertEdges, deleteNodeIds, deleteEdgeIds }` → 200 `{ "version": int64 }` | 400 | 404 | 409

- [ ] **Step 1: Write the failing handler test**

Create `backend/internal/httpapi/graphs_test.go`:

```go
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubAPI struct {
	created     domain.Graph
	createErr   error
	graph       domain.Graph
	getErr      error
	sub         domain.Subgraph
	subErr      error
	version     int64
	applyErr    error
	gotBaseVer  int64
	gotMutation domain.Mutations
}

func (s *stubAPI) CreateGraph(_ context.Context, name string) (domain.Graph, error) {
	if s.createErr != nil {
		return domain.Graph{}, s.createErr
	}
	s.created.Name = name
	return s.created, nil
}
func (s *stubAPI) GetGraph(_ context.Context, _ string) (domain.Graph, error) {
	return s.graph, s.getErr
}
func (s *stubAPI) GetSubgraph(_ context.Context, _ string) (domain.Subgraph, error) {
	return s.sub, s.subErr
}
func (s *stubAPI) ApplyMutations(_ context.Context, _ string, base int64, m domain.Mutations) (int64, error) {
	s.gotBaseVer = base
	s.gotMutation = m
	return s.version, s.applyErr
}

func doReq(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCreateGraph_201(t *testing.T) {
	api := &stubAPI{created: domain.Graph{ID: "g1", Version: 1}}
	rec := doReq(t, NewRouter(api), http.MethodPost, "/graphs", `{"name":"demo"}`)
	require.Equal(t, http.StatusCreated, rec.Code)
	var g domain.Graph
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &g))
	assert.Equal(t, "g1", g.ID)
	assert.Equal(t, "demo", g.Name)
}

func TestCreateGraph_400OnInvalid(t *testing.T) {
	api := &stubAPI{createErr: service.ErrInvalidInput}
	rec := doReq(t, NewRouter(api), http.MethodPost, "/graphs", `{"name":""}`)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetGraph_404(t *testing.T) {
	api := &stubAPI{getErr: domain.ErrNotFound}
	rec := doReq(t, NewRouter(api), http.MethodGet, "/graphs/x", "")
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetSubgraph_200(t *testing.T) {
	api := &stubAPI{sub: domain.Subgraph{Nodes: []domain.Node{{ID: "n1", Type: "Task"}}}}
	rec := doReq(t, NewRouter(api), http.MethodGet, "/graphs/g1/subgraph", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var sg domain.Subgraph
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &sg))
	assert.Len(t, sg.Nodes, 1)
}

func TestApplyMutations_200(t *testing.T) {
	api := &stubAPI{version: 7}
	body := `{"baseVersion":6,"upsertNodes":[{"id":"n1","type":"Task","properties":{}}]}`
	rec := doReq(t, NewRouter(api), http.MethodPost, "/graphs/g1/mutations", body)
	require.Equal(t, http.StatusOK, rec.Code)
	var out map[string]int64
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	assert.Equal(t, int64(7), out["version"])
	assert.Equal(t, int64(6), api.gotBaseVer)
	assert.Len(t, api.gotMutation.UpsertNodes, 1)
}

func TestApplyMutations_409OnConflict(t *testing.T) {
	api := &stubAPI{applyErr: domain.ErrVersionConflict}
	rec := doReq(t, NewRouter(api), http.MethodPost, "/graphs/g1/mutations", `{"baseVersion":1}`)
	assert.Equal(t, http.StatusConflict, rec.Code)
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/httpapi/`
Expected: FAIL — `NewRouter` signature mismatch / undefined handlers.

- [ ] **Step 3: Write the JSON + error responders**

Create `backend/internal/httpapi/respond.go`:

```go
package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/aeig/backend/internal/domain"
	"github.com/aeig/backend/internal/service"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, domain.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, domain.ErrVersionConflict):
		status = http.StatusConflict
	case errors.Is(err, service.ErrInvalidInput):
		status = http.StatusBadRequest
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
```

- [ ] **Step 4: Write the graph handlers**

Create `backend/internal/httpapi/graphs.go`:

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

type GraphAPI interface {
	CreateGraph(ctx context.Context, name string) (domain.Graph, error)
	GetGraph(ctx context.Context, id string) (domain.Graph, error)
	GetSubgraph(ctx context.Context, id string) (domain.Subgraph, error)
	ApplyMutations(ctx context.Context, id string, baseVersion int64, m domain.Mutations) (int64, error)
}

func handleCreateGraph(api GraphAPI) http.HandlerFunc {
	type request struct {
		Name string `json:"name"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		g, err := api.CreateGraph(r.Context(), req.Name)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, g)
	}
}

func handleGetGraph(api GraphAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		g, err := api.GetGraph(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, g)
	}
}

func handleGetSubgraph(api GraphAPI) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sg, err := api.GetSubgraph(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, sg)
	}
}

func handleApplyMutations(api GraphAPI) http.HandlerFunc {
	type request struct {
		BaseVersion int64 `json:"baseVersion"`
		domain.Mutations
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, service.ErrInvalidInput)
			return
		}
		v, err := api.ApplyMutations(r.Context(), chi.URLParam(r, "id"), req.BaseVersion, req.Mutations)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]int64{"version": v})
	}
}
```

- [ ] **Step 5: Update the router**

Replace `backend/internal/httpapi/router.go` with:

```go
package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(api GraphAPI) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", handleHealth)
	r.Route("/graphs", func(r chi.Router) {
		r.Post("/", handleCreateGraph(api))
		r.Get("/{id}", handleGetGraph(api))
		r.Get("/{id}/subgraph", handleGetSubgraph(api))
		r.Post("/{id}/mutations", handleApplyMutations(api))
	})
	return r
}
```

- [ ] **Step 6: Fix the health test's call site**

In `backend/internal/httpapi/health_test.go`, change the one line `srv := httptest.NewServer(NewRouter())` to:

```go
	srv := httptest.NewServer(NewRouter(nil))
```

(The health route does not touch `api`, so `nil` is safe.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && go test ./internal/httpapi/`
Expected: PASS (health test + 6 graph handler tests).

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(backend): REST handlers for graphs, subgraph, and mutations"
```

---

## Task 3: Wire the server (main.go)

**Files:**
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `config.Load`, `postgres.NewPool`/`RunMigrations`/`NewGraphRepo`, `neo4j.NewDriver`/`NewElementRepo`, `service.NewGraphService`, `httpapi.NewRouter`.
- Produces: a runnable binary that migrates Postgres on boot and serves the API.

- [ ] **Step 1: Replace main.go with full wiring**

Replace `backend/cmd/server/main.go` with:

```go
package main

import (
	"context"
	"log"
	"net/http"

	"github.com/aeig/backend/internal/config"
	"github.com/aeig/backend/internal/httpapi"
	"github.com/aeig/backend/internal/service"
	neo4jstore "github.com/aeig/backend/internal/storage/neo4j"
	pgstore "github.com/aeig/backend/internal/storage/postgres"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if err := pgstore.RunMigrations(cfg.PostgresDSN); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	ctx := context.Background()
	pool, err := pgstore.NewPool(ctx, cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()

	driver, err := neo4jstore.NewDriver(cfg.Neo4jURI, cfg.Neo4jUser, cfg.Neo4jPassword)
	if err != nil {
		log.Fatalf("neo4j: %v", err)
	}
	defer driver.Close(ctx)

	svc := service.NewGraphService(
		pgstore.NewGraphRepo(pool),
		neo4jstore.NewElementRepo(driver),
	)

	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, httpapi.NewRouter(svc)); err != nil {
		log.Fatalf("server: %v", err)
	}
}
```

- [ ] **Step 2: Build and vet**

Run: `cd backend && go build ./... && go vet ./...`
Expected: no output, exit 0.

- [ ] **Step 3: Manual smoke test (databases up)**

Bring up the databases and run the server (see 1A `docker-compose.yml` and the env vars in `config`), then:

```bash
docker compose up -d
# export HTTP_ADDR, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, POSTGRES_DSN (see 1A)
cd backend && go run ./cmd/server &
curl -s localhost:8080/health
curl -s -XPOST localhost:8080/graphs -d '{"name":"demo"}'          # → {"id":...,"version":1}
# using the returned id:
curl -s localhost:8080/graphs/<id>/subgraph                        # → {"nodes":[],"edges":[]}
curl -s -XPOST localhost:8080/graphs/<id>/mutations \
  -d '{"baseVersion":1,"upsertNodes":[{"id":"n1","type":"Task","properties":{"status":"open"}}]}'  # → {"version":2}
curl -s localhost:8080/graphs/<id>/mutations -XPOST -d '{"baseVersion":1}'  # → 409
```
Expected: statuses/bodies as annotated.

- [ ] **Step 4: Commit**

```bash
git add backend
git commit -m "feat(backend): wire server with postgres migrations, neo4j, and graph API"
```

---

## Self-Review (slice 1B)

**Spec coverage (against §7 optimistic concurrency, §8 API):**
- `POST /graphs`, `GET /graphs/{id}`, `GET /graphs/{id}/subgraph`, `POST /graphs/{id}/mutations` → Task 2. Matches §8 rows for `graphs`, subgraph via `views`-precursor (full-graph read; typed projection is phase 2), and batch mutations with `baseVersion`. ✓
- Optimistic version with `409` on stale write → service `ApplyMutations` (Task 1) + error mapping (Task 2). ✓
- Frontend never sends raw Cypher (§8) → API surface is typed CRUD only; no Cypher endpoint in phase 1. ✓

**Placeholder scan:** none — all steps carry runnable code/commands.

**Type consistency:** `GraphAPI` (httpapi) is a structural superset satisfied by `*service.GraphService`; method names/signatures (`CreateGraph`, `GetGraph`, `GetSubgraph`, `ApplyMutations`) match across `service`, `httpapi`, and both stub implementations. `domain.Mutations` field names (`upsertNodes`/`upsertEdges`/`deleteNodeIds`/`deleteEdgeIds`) are identical in the type, the handler request struct (embedded), and the curl smoke test.

**Known phase-1 limitation (documented, intentional):** the version bump (Postgres) and element writes (Neo4j) are not one atomic transaction; a mid-mutation Neo4j failure advances the version without applying all writes. The client recovers by re-fetching the subgraph. Revisit if phase-4 versioning polish requires stronger guarantees.

---

## Post-completion: build the backend code knowledge graph (`/graphify`)

Run this only **after** all three tasks are merged and the slice self-review passes. It builds a persistent, queryable knowledge graph of the Go backend produced in this slice, used to reason about architecture and file relationships in later phases (and to feed the `graphify` query/path/explain tools).

- [ ] **Step 1: Run the pipeline over the backend code**

From the repo root:

```
/graphify backend
```

The Go corpus is code-only, so extraction is pure **AST** — deterministic, no API key, no LLM token cost. Outputs land in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`).

- [ ] **Step 2: Sanity-check the graph**

Confirm the run reported a **non-empty** graph (nodes/edges > 0) and `Graph health: OK`. Skim `graphify-out/GRAPH_REPORT.md`; the God Nodes should surface the expected hubs — `internal/service`, `internal/httpapi`, `internal/storage/postgres`, `internal/storage/neo4j`, `internal/domain`. If `domain` is **not** a hub, that signals the layers are more coupled than intended — note it for the next slice.

- [ ] **Step 3: Record the artifact**

Add `graphify-out/` to the repo `.gitignore` (it is a regenerable artifact), or commit `graphify-out/GRAPH_REPORT.md` alone if the team wants the audit trail versioned. Do not commit the `graph.html`/`graph.json` blobs unless deliberately desired.

```bash
# option A — ignore the generated dir
printf '\ngraphify-out/\n' >> .gitignore
git add .gitignore && git commit -m "chore: ignore graphify-out/ (generated code graph)"
```

> Optional: `/graphify backend --neo4j` also emits `graphify-out/cypher.txt`. If you push it into Neo4j, use a **separate database/instance** from the application graph data — do not mix the code graph with app graphs sharing `graphId`.


