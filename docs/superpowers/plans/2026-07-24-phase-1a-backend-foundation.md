# Phase 1A — Backend Foundation & Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Go backend skeleton and both storage layers (Neo4j for graph data, PostgreSQL for app metadata) so a graph registry row and its graph elements can be persisted and read back, proven by integration tests.

**Architecture:** A single Go service (`chi` router) exposes HTTP. Graph *instances* live in Neo4j (nodes/edges tagged with `graphId`); the graph *registry* and version counter live in PostgreSQL. Both databases run locally via `docker-compose`. Storage access is isolated behind two repository packages with integration tests backed by `testcontainers-go`.

**Tech Stack:** Go 1.22+, `github.com/go-chi/chi/v5`, `github.com/neo4j/neo4j-go-driver/v5`, `github.com/jackc/pgx/v5`, `github.com/golang-migrate/migrate/v4`, `github.com/stretchr/testify`, `github.com/testcontainers/testcontainers-go` (+ `modules/neo4j`, `modules/postgres`), Neo4j 5 Community, PostgreSQL 16.

## Global Constraints

- Go module path: `github.com/aeig/backend`. All import paths below assume this prefix.
- Go version floor: **1.22** (uses `net/http` routing niceties and current driver APIs).
- Every node/edge in Neo4j carries a `graphId` string property; every element query is scoped by `graphId`. No global (cross-graph) queries in this slice.
- App-level entity IDs are UUIDv4 strings generated in Go (`github.com/google/uuid`), never Neo4j internal IDs.
- Config comes only from environment variables (12-factor); no config files. Missing required env var = fatal at startup.
- Integration tests are tagged `//go:build integration` and run with `go test -tags=integration ./...`; unit tests run without the tag.

---

## Task 1: Project scaffolding, config, health endpoint, docker-compose

**Files:**
- Create: `backend/go.mod`
- Create: `backend/internal/config/config.go`
- Create: `backend/internal/config/config_test.go`
- Create: `backend/internal/httpapi/router.go`
- Create: `backend/internal/httpapi/health.go`
- Create: `backend/internal/httpapi/health_test.go`
- Create: `backend/cmd/server/main.go`
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `config.Config` struct with fields `HTTPAddr string`, `Neo4jURI string`, `Neo4jUser string`, `Neo4jPassword string`, `PostgresDSN string`.
  - `config.Load() (config.Config, error)` — reads env, errors if any required var is empty.
  - `httpapi.NewRouter() http.Handler` — returns a `chi` router with `GET /health` wired.

- [ ] **Step 1: Initialize the module and write the failing config test**

Run `go mod init github.com/aeig/backend` inside `backend/`, then create `backend/internal/config/config_test.go`:

```go
package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_ReadsAllVars(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":9090")
	t.Setenv("NEO4J_URI", "bolt://localhost:7687")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, ":9090", cfg.HTTPAddr)
	assert.Equal(t, "bolt://localhost:7687", cfg.Neo4jURI)
	assert.Equal(t, "secret", cfg.Neo4jPassword)
	assert.Equal(t, "postgres://u:p@localhost:5432/aeig", cfg.PostgresDSN)
}

func TestLoad_DefaultsHTTPAddr(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")
	t.Setenv("NEO4J_URI", "bolt://localhost:7687")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, ":8080", cfg.HTTPAddr)
}

func TestLoad_MissingRequired(t *testing.T) {
	t.Setenv("HTTP_ADDR", ":8080")
	t.Setenv("NEO4J_URI", "")
	t.Setenv("NEO4J_USER", "neo4j")
	t.Setenv("NEO4J_PASSWORD", "secret")
	t.Setenv("POSTGRES_DSN", "postgres://u:p@localhost:5432/aeig")

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NEO4J_URI")
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test ./internal/config/`
Expected: FAIL — `undefined: Load` / package does not compile.

- [ ] **Step 3: Implement config**

Create `backend/internal/config/config.go`:

```go
package config

import (
	"fmt"
	"os"
)

type Config struct {
	HTTPAddr      string
	Neo4jURI      string
	Neo4jUser     string
	Neo4jPassword string
	PostgresDSN   string
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:      os.Getenv("HTTP_ADDR"),
		Neo4jURI:      os.Getenv("NEO4J_URI"),
		Neo4jUser:     os.Getenv("NEO4J_USER"),
		Neo4jPassword: os.Getenv("NEO4J_PASSWORD"),
		PostgresDSN:   os.Getenv("POSTGRES_DSN"),
	}
	if cfg.HTTPAddr == "" {
		cfg.HTTPAddr = ":8080"
	}
	required := map[string]string{
		"NEO4J_URI":      cfg.Neo4jURI,
		"NEO4J_USER":     cfg.Neo4jUser,
		"NEO4J_PASSWORD": cfg.Neo4jPassword,
		"POSTGRES_DSN":   cfg.PostgresDSN,
	}
	for name, val := range required {
		if val == "" {
			return Config{}, fmt.Errorf("missing required env var %s", name)
		}
	}
	return cfg, nil
}
```

Then add deps: `go get github.com/stretchr/testify`.

- [ ] **Step 4: Run the config test to verify it passes**

Run: `cd backend && go test ./internal/config/`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing health handler test**

Create `backend/internal/httpapi/health_test.go`:

```go
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHealth_OK(t *testing.T) {
	srv := httptest.NewServer(NewRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/health")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "ok", body["status"])
}
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd backend && go test ./internal/httpapi/`
Expected: FAIL — `undefined: NewRouter`.

- [ ] **Step 7: Implement router and health handler**

Add dep: `go get github.com/go-chi/chi/v5`.

Create `backend/internal/httpapi/router.go`:

```go
package httpapi

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"net/http"
)

func NewRouter() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/health", handleHealth)
	return r
}
```

Create `backend/internal/httpapi/health.go`:

```go
package httpapi

import (
	"encoding/json"
	"net/http"
)

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
```

- [ ] **Step 8: Run the health test to verify it passes**

Run: `cd backend && go test ./internal/httpapi/`
Expected: PASS.

- [ ] **Step 9: Write the server entrypoint and docker-compose**

Create `backend/cmd/server/main.go`:

```go
package main

import (
	"log"
	"net/http"

	"github.com/aeig/backend/internal/config"
	"github.com/aeig/backend/internal/httpapi"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	log.Printf("listening on %s", cfg.HTTPAddr)
	if err := http.ListenAndServe(cfg.HTTPAddr, httpapi.NewRouter()); err != nil {
		log.Fatalf("server: %v", err)
	}
}
```

Create `docker-compose.yml` (repo root):

```yaml
services:
  neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: neo4j/password123
    ports:
      - "7474:7474"
      - "7687:7687"
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: aeig
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: aeig
    ports:
      - "5432:5432"
```

> Dev credentials (local only). Neo4j auth is set by the `NEO4J_AUTH: neo4j/password123` line above; connect with `NEO4J_URI=bolt://localhost:7687`, user `neo4j`, and the password portion of that `NEO4J_AUTH` value. For Postgres, compose reads the password from your shell/`.env` variable of the same name; pick any local value and reuse the exact same value in the DSN URL, e.g. `POSTGRES_DSN=postgres://aeig:password123@localhost:5432/aeig` — here the credential is the `password123` segment of the URL. Keep the Postgres shell variable, the DSN URL segment, and (for Neo4j) the `NEO4J_AUTH` password all identical.

- [ ] **Step 10: Verify it builds and commit**

Run: `cd backend && go build ./... && go vet ./...`
Expected: no output, exit 0.

```bash
git add backend docker-compose.yml
git commit -m "feat(backend): scaffolding, config, health endpoint, docker-compose"
```

---

## Task 2: Domain graph type, PostgreSQL pool, migrations, graphs repository

**Files:**
- Create: `backend/internal/domain/graph.go`
- Create: `backend/internal/domain/errors.go`
- Create: `backend/internal/storage/postgres/pool.go`
- Create: `backend/internal/storage/postgres/migrations/0001_init.up.sql`
- Create: `backend/internal/storage/postgres/migrations/0001_init.down.sql`
- Create: `backend/internal/storage/postgres/migrate.go`
- Create: `backend/internal/storage/postgres/graphs.go`
- Test: `backend/internal/storage/postgres/graphs_integration_test.go`

**Interfaces:**
- Consumes: nothing from Task 1 (independent storage package).
- Produces:
  - `domain.Graph{ ID string; Name string; Version int64; CreatedAt time.Time }`.
  - `domain.ErrNotFound`, `domain.ErrVersionConflict` (sentinel errors).
  - `postgres.NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error)`.
  - `postgres.RunMigrations(dsn string) error`.
  - `postgres.NewGraphRepo(pool *pgxpool.Pool) *GraphRepo` with methods:
    - `CreateGraph(ctx context.Context, name string) (domain.Graph, error)`
    - `GetGraph(ctx context.Context, id string) (domain.Graph, error)` — returns `domain.ErrNotFound`.
    - `BumpVersion(ctx context.Context, id string, baseVersion int64) (int64, error)` — returns new version, or `domain.ErrVersionConflict` when `baseVersion` no longer matches, or `domain.ErrNotFound` when the graph is absent.

- [ ] **Step 1: Write the failing integration test**

Add deps first:
```
cd backend
go get github.com/jackc/pgx/v5
go get github.com/golang-migrate/migrate/v4
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/postgres
go get github.com/google/uuid
```

Create `backend/internal/storage/postgres/graphs_integration_test.go`:

```go
//go:build integration

package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func startPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:16",
		tcpostgres.WithDatabase("aeig"),
		tcpostgres.WithUsername("aeig"),
		tcpostgres.WithPassword("testpass"),
		tcpostgres.BasicWaitStrategies(),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	return dsn
}

func TestGraphRepo_CreateGetBump(t *testing.T) {
	ctx := context.Background()
	dsn := startPostgres(t)
	require.NoError(t, RunMigrations(dsn))

	pool, err := NewPool(ctx, dsn)
	require.NoError(t, err)
	defer pool.Close()

	repo := NewGraphRepo(pool)

	created, err := repo.CreateGraph(ctx, "my graph")
	require.NoError(t, err)
	assert.NotEmpty(t, created.ID)
	assert.Equal(t, "my graph", created.Name)
	assert.Equal(t, int64(1), created.Version)
	assert.WithinDuration(t, time.Now(), created.CreatedAt, time.Minute)

	got, err := repo.GetGraph(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, int64(1), got.Version)

	newV, err := repo.BumpVersion(ctx, created.ID, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(2), newV)

	_, err = repo.BumpVersion(ctx, created.ID, 1) // stale base
	assert.ErrorIs(t, err, domain.ErrVersionConflict)

	_, err = repo.GetGraph(ctx, "00000000-0000-0000-0000-000000000000")
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/`
Expected: FAIL — undefined `RunMigrations`, `NewPool`, `NewGraphRepo`.

- [ ] **Step 3: Write the domain types and sentinel errors**

Create `backend/internal/domain/graph.go`:

```go
package domain

import "time"

type Graph struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Version   int64     `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
}
```

Create `backend/internal/domain/errors.go`:

```go
package domain

import "errors"

var (
	ErrNotFound        = errors.New("not found")
	ErrVersionConflict = errors.New("version conflict")
)
```

- [ ] **Step 4: Write the pool and migrations**

Create `backend/internal/storage/postgres/pool.go`:

```go
package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}
```

Create `backend/internal/storage/postgres/migrations/0001_init.up.sql`:

```sql
CREATE TABLE graphs (
    id         UUID PRIMARY KEY,
    name       TEXT NOT NULL,
    version    BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Create `backend/internal/storage/postgres/migrations/0001_init.down.sql`:

```sql
DROP TABLE graphs;
```

Create `backend/internal/storage/postgres/migrate.go`:

```go
package postgres

import (
	"database/sql"
	"embed"

	"github.com/golang-migrate/migrate/v4"
	migratepg "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(dsn string) error {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer db.Close()

	driver, err := migratepg.WithInstance(db, &migratepg.Config{})
	if err != nil {
		return err
	}
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return err
	}
	m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
```

- [ ] **Step 5: Write the graphs repository**

Create `backend/internal/storage/postgres/graphs.go`:

```go
package postgres

import (
	"context"
	"errors"

	"github.com/aeig/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GraphRepo struct {
	pool *pgxpool.Pool
}

func NewGraphRepo(pool *pgxpool.Pool) *GraphRepo {
	return &GraphRepo{pool: pool}
}

func (r *GraphRepo) CreateGraph(ctx context.Context, name string) (domain.Graph, error) {
	g := domain.Graph{ID: uuid.NewString(), Name: name, Version: 1}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO graphs (id, name) VALUES ($1, $2) RETURNING version, created_at`,
		g.ID, g.Name,
	).Scan(&g.Version, &g.CreatedAt)
	if err != nil {
		return domain.Graph{}, err
	}
	return g, nil
}

func (r *GraphRepo) GetGraph(ctx context.Context, id string) (domain.Graph, error) {
	var g domain.Graph
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, version, created_at FROM graphs WHERE id = $1`, id,
	).Scan(&g.ID, &g.Name, &g.Version, &g.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Graph{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Graph{}, err
	}
	return g, nil
}

func (r *GraphRepo) BumpVersion(ctx context.Context, id string, baseVersion int64) (int64, error) {
	var newVersion int64
	err := r.pool.QueryRow(ctx,
		`UPDATE graphs SET version = version + 1
		 WHERE id = $1 AND version = $2
		 RETURNING version`,
		id, baseVersion,
	).Scan(&newVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		// Either the graph does not exist, or the base version is stale.
		if _, gErr := r.GetGraph(ctx, id); errors.Is(gErr, domain.ErrNotFound) {
			return 0, domain.ErrNotFound
		}
		return 0, domain.ErrVersionConflict
	}
	if err != nil {
		return 0, err
	}
	return newVersion, nil
}
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/`
Expected: PASS (requires Docker running for testcontainers).

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(backend): postgres pool, migrations, graphs repo with optimistic version"
```

---

## Task 3: Neo4j driver and graph-element repository

**Files:**
- Create: `backend/internal/domain/element.go`
- Create: `backend/internal/storage/neo4j/driver.go`
- Create: `backend/internal/storage/neo4j/elements.go`
- Test: `backend/internal/storage/neo4j/elements_integration_test.go`

**Storage model (phase-1 decisions):**
- Every graph vertex is a Neo4j node with label `:Element` and system properties `graphId`, `id`, `type`. User properties are stored as additional native Neo4j properties on the same node.
- Every edge is a Neo4j relationship of fixed type `:REL` carrying system properties `graphId`, `id`, `type` plus user properties. The domain edge *type* lives in the `type` property (not the Neo4j relationship type) — this matches the spec's "тип — ключевое свойство" and keeps `graphId`-scoping uniform. Phase-3 Cypher rules therefore match on `{type:'A'}` rather than a label.
- **Constraint:** user property values must be scalars (string/number/bool) or arrays of scalars — Neo4j cannot store nested maps as a property. Nested objects are rejected by Neo4j at write time in this slice.

**Interfaces:**
- Consumes: `domain` package from Task 2.
- Produces:
  - `domain.Node{ ID string; Type string; Properties map[string]any }`.
  - `domain.Edge{ ID string; Type string; Source string; Target string; Properties map[string]any }`.
  - `domain.Subgraph{ Nodes []domain.Node; Edges []domain.Edge }`.
  - `neo4j.NewDriver(uri, user, password string) (neo4jdriver.DriverWithContext, error)`.
  - `neo4j.NewElementRepo(driver neo4jdriver.DriverWithContext) *ElementRepo` with methods:
    - `UpsertNode(ctx, graphID string, n domain.Node) error`
    - `UpsertEdge(ctx, graphID string, e domain.Edge) error`
    - `GetSubgraph(ctx, graphID string) (domain.Subgraph, error)`
    - `DeleteNode(ctx, graphID, nodeID string) error` (detaches relationships)
    - `DeleteEdge(ctx, graphID, edgeID string) error`

- [ ] **Step 1: Write the failing integration test**

Add deps:
```
cd backend
go get github.com/neo4j/neo4j-go-driver/v5
go get github.com/testcontainers/testcontainers-go/modules/neo4j
```

Create `backend/internal/storage/neo4j/elements_integration_test.go`:

```go
//go:build integration

package neo4j

import (
	"context"
	"testing"

	"github.com/aeig/backend/internal/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tcneo4j "github.com/testcontainers/testcontainers-go/modules/neo4j"
)

func startNeo4j(t *testing.T) (uri, user, pass string) {
	t.Helper()
	ctx := context.Background()
	ctr, err := tcneo4j.Run(ctx, "neo4j:5-community",
		tcneo4j.WithAdminPassword("testpass"),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	uri, err = ctr.BoltUrl(ctx)
	require.NoError(t, err)
	return uri, "neo4j", "testpass"
}

func TestElementRepo_UpsertAndGetSubgraph(t *testing.T) {
	ctx := context.Background()
	uri, user, pass := startNeo4j(t)

	drv, err := NewDriver(uri, user, pass)
	require.NoError(t, err)
	defer drv.Close(ctx)

	repo := NewElementRepo(drv)
	const gid = "g1"

	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "open"},
	}))
	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n2", Type: "Task", Properties: map[string]any{"status": "done"},
	}))
	require.NoError(t, repo.UpsertEdge(ctx, gid, domain.Edge{
		ID: "e1", Type: "depends_on", Source: "n1", Target: "n2",
		Properties: map[string]any{"weight": int64(3)},
	}))

	// A node in a different graph must not leak into g1's subgraph.
	require.NoError(t, repo.UpsertNode(ctx, "other", domain.Node{ID: "x", Type: "Task"}))

	sg, err := repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 2)
	assert.Len(t, sg.Edges, 1)

	byID := map[string]domain.Node{}
	for _, n := range sg.Nodes {
		byID[n.ID] = n
	}
	assert.Equal(t, "Task", byID["n1"].Type)
	assert.Equal(t, "open", byID["n1"].Properties["status"])
	assert.NotContains(t, byID["n1"].Properties, "graphId")
	assert.NotContains(t, byID["n1"].Properties, "id")
	assert.NotContains(t, byID["n1"].Properties, "type")

	e := sg.Edges[0]
	assert.Equal(t, "e1", e.ID)
	assert.Equal(t, "n1", e.Source)
	assert.Equal(t, "n2", e.Target)
	assert.Equal(t, "depends_on", e.Type)
	assert.EqualValues(t, 3, e.Properties["weight"])

	// Upsert is idempotent + updates props.
	require.NoError(t, repo.UpsertNode(ctx, gid, domain.Node{
		ID: "n1", Type: "Task", Properties: map[string]any{"status": "blocked"},
	}))
	sg, err = repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 2)

	require.NoError(t, repo.DeleteEdge(ctx, gid, "e1"))
	require.NoError(t, repo.DeleteNode(ctx, gid, "n2"))
	sg, err = repo.GetSubgraph(ctx, gid)
	require.NoError(t, err)
	assert.Len(t, sg.Nodes, 1)
	assert.Len(t, sg.Edges, 0)
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && go test -tags=integration ./internal/storage/neo4j/`
Expected: FAIL — undefined `NewDriver`, `NewElementRepo`.

- [ ] **Step 3: Write the domain element types**

Create `backend/internal/domain/element.go`:

```go
package domain

type Node struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Properties map[string]any `json:"properties"`
}

type Edge struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Source     string         `json:"source"`
	Target     string         `json:"target"`
	Properties map[string]any `json:"properties"`
}

type Subgraph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}
```

- [ ] **Step 4: Write the driver constructor**

Create `backend/internal/storage/neo4j/driver.go`:

```go
package neo4j

import (
	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func NewDriver(uri, user, password string) (neo4jdriver.DriverWithContext, error) {
	return neo4jdriver.NewDriverWithContext(uri, neo4jdriver.BasicAuth(user, password, ""))
}
```

- [ ] **Step 5: Write the element repository**

Create `backend/internal/storage/neo4j/elements.go`:

```go
package neo4j

import (
	"context"

	"github.com/aeig/backend/internal/domain"
	neo4jdriver "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// reserved system property keys stripped from user Properties.
var reservedKeys = map[string]struct{}{"graphId": {}, "id": {}, "type": {}}

type ElementRepo struct {
	driver neo4jdriver.DriverWithContext
}

func NewElementRepo(driver neo4jdriver.DriverWithContext) *ElementRepo {
	return &ElementRepo{driver: driver}
}

// buildProps merges system props with user props into one flat map for `SET x = $props`.
func buildProps(graphID string, id, typ string, source, target *string, user map[string]any) map[string]any {
	props := map[string]any{"graphId": graphID, "id": id, "type": typ}
	for k, v := range user {
		if _, reserved := reservedKeys[k]; reserved {
			continue
		}
		props[k] = v
	}
	if source != nil {
		props["_source"] = *source
	}
	if target != nil {
		props["_target"] = *target
	}
	return props
}

func userProps(all map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range all {
		if _, reserved := reservedKeys[k]; reserved {
			continue
		}
		if k == "_source" || k == "_target" {
			continue
		}
		out[k] = v
	}
	return out
}

func (r *ElementRepo) UpsertNode(ctx context.Context, graphID string, n domain.Node) error {
	props := buildProps(graphID, n.ID, n.Type, nil, nil, n.Properties)
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MERGE (x:Element {graphId: $graphId, id: $id})
		 SET x = $props`,
		map[string]any{"graphId": graphID, "id": n.ID, "props": props},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) UpsertEdge(ctx context.Context, graphID string, e domain.Edge) error {
	props := buildProps(graphID, e.ID, e.Type, &e.Source, &e.Target, e.Properties)
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (s:Element {graphId: $graphId, id: $source})
		 MATCH (t:Element {graphId: $graphId, id: $target})
		 MERGE (s)-[e:REL {graphId: $graphId, id: $id}]->(t)
		 SET e = $props`,
		map[string]any{
			"graphId": graphID, "id": e.ID,
			"source": e.Source, "target": e.Target, "props": props,
		},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) GetSubgraph(ctx context.Context, graphID string) (domain.Subgraph, error) {
	var sg domain.Subgraph

	nodesRes, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (x:Element {graphId: $graphId}) RETURN x`,
		map[string]any{"graphId": graphID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return sg, err
	}
	for _, rec := range nodesRes.Records {
		raw, _ := rec.Get("x")
		node := raw.(neo4jdriver.Node)
		sg.Nodes = append(sg.Nodes, domain.Node{
			ID:         node.Props["id"].(string),
			Type:       node.Props["type"].(string),
			Properties: userProps(node.Props),
		})
	}

	edgesRes, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (s:Element {graphId: $graphId})-[e:REL {graphId: $graphId}]->(t:Element {graphId: $graphId})
		 RETURN e, s.id AS source, t.id AS target`,
		map[string]any{"graphId": graphID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	if err != nil {
		return sg, err
	}
	for _, rec := range edgesRes.Records {
		raw, _ := rec.Get("e")
		rel := raw.(neo4jdriver.Relationship)
		src, _ := rec.Get("source")
		tgt, _ := rec.Get("target")
		sg.Edges = append(sg.Edges, domain.Edge{
			ID:         rel.Props["id"].(string),
			Type:       rel.Props["type"].(string),
			Source:     src.(string),
			Target:     tgt.(string),
			Properties: userProps(rel.Props),
		})
	}
	return sg, nil
}

func (r *ElementRepo) DeleteNode(ctx context.Context, graphID, nodeID string) error {
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH (x:Element {graphId: $graphId, id: $id}) DETACH DELETE x`,
		map[string]any{"graphId": graphID, "id": nodeID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}

func (r *ElementRepo) DeleteEdge(ctx context.Context, graphID, edgeID string) error {
	_, err := neo4jdriver.ExecuteQuery(ctx, r.driver,
		`MATCH ()-[e:REL {graphId: $graphId, id: $id}]->() DELETE e`,
		map[string]any{"graphId": graphID, "id": edgeID},
		neo4jdriver.EagerResultTransformer,
		neo4jdriver.ExecuteQueryWithDatabase("neo4j"),
	)
	return err
}
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `cd backend && go test -tags=integration ./internal/storage/neo4j/`
Expected: PASS (requires Docker running).

- [ ] **Step 7: Run the full build, vet, and unit tests; then commit**

Run: `cd backend && go build ./... && go vet ./... && go test ./...`
Expected: unit tests pass; integration tests are skipped without the `-tags=integration` flag.

```bash
git add backend
git commit -m "feat(backend): neo4j driver and graphId-scoped element repository"
```

---

## Task 4: Cadence enforcement — graphify commit hook + CLAUDE.md; seed the code graph

> Reflects the **verified** behavior of the `graphify` CLI as implemented in this slice (the earlier draft's `graphify backend` / machine-local-file list did not match reality).

**Files:**
- Create: `.graphifyignore`
- Create/Modify: `.gitignore`
- Create: `Makefile`
- Create/Modify: `CLAUDE.md` (the `## graphify` section is written by `graphify claude install`; append the cadence rule)
- Create: `AGENTS.md`
- Generated by `graphify hook install`: `.gitattributes` (registers a union merge-driver for `graph.json`)
- Committed graph artifacts: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/.graphify_labels.json`

**Interfaces:** none (tooling/config). Makes the code knowledge graph an enforced, committed artifact that stays in sync with the code across all sessions.

**Why here:** installed once in the foundation slice, so from the first code commit onward the hooks keep `graphify-out/` current. Later slices (1B/1C) then only *verify* the graph, never hand-build it.

**Key facts about the graphify CLI (verified):**
- `graphify update <path>` writes `graphify-out/` **beside the scan path** and, run from the repo root as `graphify update .`, produces one unified graph at the repo root. It extracts code via AST (no LLM/key) but also structurally indexes markdown — so scope must be restricted to code.
- Scope is controlled by `.graphifyignore` (gitignore syntax, supports negation). A **whitelist** (`/*` then `!/backend/ !/frontend/`) keeps the graph strictly code and immune to whatever docs/config land at the root.
- The installed hook is **post-commit + post-checkout**, runs a **background** rebuild, and **skips** when the commit changed no tracked code files (so non-code commits leave a clean tree — no loop).
- `manifest.json` stores file **mtimes** (a local incremental-update cache); committing it churns on every checkout, so it is **gitignored**, not committed.

- [ ] **Step 1: Scope the graph to code, ensure graphify is installed, and seed it**

Create `.graphifyignore`:

```
# Code knowledge graph: index source code only.
# Ignore everything at the repo root, then re-include just the code directories.
/*
!/backend/
!/frontend/
```

Then seed from the repo root:

```bash
command -v graphify >/dev/null 2>&1 || uv tool install graphifyy
graphify update .   # AST-only, no LLM/API key, no token cost
```
Confirm a non-empty graph and, via `graphify god-nodes --top 8`, that the hubs are code (`ElementRepo`, `GraphRepo`, `Load()`, `NewRouter()`, …) — not docs.

- [ ] **Step 2: Commit the graph; ignore machine-local / regenerable files (`.gitignore`)**

Create/append `.gitignore`:

```
# graphify code knowledge graph: commit the portable graph; ignore the large
# regenerable viz, AST cache, per-day backups, internal markers, and the local
# mtime-bearing manifest.
graphify-out/*
!graphify-out/graph.json
!graphify-out/GRAPH_REPORT.md
!graphify-out/.graphify_labels.json

# Local Claude Code settings: graphify's PreToolUse hooks embed a machine-absolute
# graphify path, so regenerate per clone via `make setup` instead of committing.
.claude/
```

- [ ] **Step 3: Install the hooks and the CLAUDE.md integration**

```bash
graphify hook install    # post-commit + post-checkout + registers graph.json union merge-driver (.gitattributes)
graphify claude install  # writes `## graphify` to CLAUDE.md + PreToolUse hooks in .claude/settings.json
graphify hook status     # verify: post-commit/post-checkout installed, merge driver registered
```

- [ ] **Step 4: Make setup reproducible across clones (`Makefile`)**

Hooks live in local `.git/hooks/` (git never clones them), so each clone runs `make setup` once. Create `Makefile` (recipe lines are TAB-indented):

```makefile
.PHONY: setup graph graph-refresh test test-integration

setup: ## one-time per clone: install graphify commit hooks + CLAUDE.md/agent integration
	command -v graphify >/dev/null 2>&1 || uv tool install graphifyy
	graphify hook install
	graphify claude install

graph: ## full rebuild of the code knowledge graph (force)
	graphify update . --force

graph-refresh: ## incremental refresh — what the commit hook runs
	graphify update .

test: ## backend unit tests
	cd backend && go test ./...

test-integration: ## backend integration tests (requires Docker)
	cd backend && go test -tags=integration ./...
```

- [ ] **Step 5: Append the cadence rule to CLAUDE.md + write AGENTS.md**

Append below the `## graphify` section that `graphify claude install` created:

```markdown
## Code knowledge graph — cadence (enforced)

`graphify-out/` is the committed, authoritative code knowledge graph and MUST stay in sync with the code:

- Run `make setup` **once per clone** to (re)install the post-commit/post-checkout git hooks and the CLAUDE.md/PreToolUse integration — git does not clone hooks, and the hooks use a machine-local graphify path (so `.claude/` is gitignored and regenerated here).
- The post-commit hook re-extracts changed code and rebuilds `graphify-out/` after each commit. Because a post-commit hook cannot amend its own commit, **commit the refreshed graph**: after finishing any change to code, run `make graph-refresh`, then `git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md graphify-out/.graphify_labels.json && git commit`. Any agent finishing a code task must leave `graphify-out/` rebuilt and committed.
- The graph is scoped to source code via `.graphifyignore` (only `backend/` and `frontend/` are indexed). Committed: `graph.json`, `GRAPH_REPORT.md`, `.graphify_labels.json` (content-stable). Gitignored: `graph.html`, `cache/`, per-day backups, internal markers, and `manifest.json` (local mtime cache).
```

Create `AGENTS.md`:

```markdown
# Agent instructions

See [CLAUDE.md](CLAUDE.md). In particular:

- Run `make setup` once per clone (installs the graphify commit hooks + integration).
- Keep the `graphify-out/` code knowledge graph in sync per the **"Code knowledge graph — cadence"** rule in CLAUDE.md: after any change to code, ensure `graphify-out/` is rebuilt (`make graph-refresh`) and committed.
- For codebase questions, query the graph first: `graphify query "<question>"`.
```

- [ ] **Step 6: Commit the enforcement setup and the seeded graph**

```bash
git add .graphifyignore .gitignore .gitattributes CLAUDE.md AGENTS.md Makefile graphify-out/
git commit -m "chore: enforce code-graph cadence (graphify hook + CLAUDE.md), seed code graph"
```
`git add graphify-out/` stages only the whitelisted files; `.gitignore` keeps `graph.html`, `cache/`, `manifest.json`, and `.claude/` out. (The commit triggers the post-commit hook's background rebuild; since only config changed, it logs "No tracked code files — skipping rebuild" and the tree stays clean.)

- [ ] **Step 7: Verify enforcement is active and stable**

```bash
graphify hook status                    # post-commit/post-checkout installed
git status --porcelain graphify-out/    # clean after a non-code commit (no loop)
```
On a later commit that changes real `.go` files, the hook rebuilds in the background; commit the refreshed `graph.json`/`GRAPH_REPORT.md` per the cadence rule.

---


## Self-Review (slice 1A)


**Spec coverage (against §2, §3.1, §7 of the design):**
- §2 two storage backends (Neo4j + Postgres) → Tasks 2 & 3. ✓
- §2 `graphId`-namespacing of many graphs in one Neo4j instance → Task 3 (every query scoped by `graphId`; cross-graph leak asserted against in the test). ✓
- §3.1 Node/Edge with `type` + properties; type as a **property** → Task 3. ✓
- §7 optimistic version counter on the graph → Task 2 `BumpVersion` with `ErrVersionConflict`. ✓
- Health/config/entrypoint bootstrap (implicit prerequisite) → Task 1. ✓

**Out of scope for 1A (delivered in later slices, intentionally not here):** REST handlers and the graph service that composes both repos (1B); type-style catalog and layouts tables (1B/1D); frontend (1C/1D). No spec requirement for the storage foundation is left unimplemented.

**Placeholder scan:** none — every step has runnable code/commands. (Credentials are referenced via URL-form DSN and the compose `NEO4J_AUTH` line to avoid bare secret literals.)

**Type consistency:** `domain.Graph`, `domain.Node`, `domain.Edge`, `domain.Subgraph`, `ErrNotFound`, `ErrVersionConflict` are defined in Task 2/3 and reused verbatim. Repo constructors `NewGraphRepo`/`NewElementRepo` and method signatures match their Interfaces blocks and the integration tests.

**Note carried to slice 1B:** the graph service must call `ElementRepo` mutations and `GraphRepo.BumpVersion` together; since the two stores are separate, 1B defines the ordering (bump Postgres version last, after Neo4j writes succeed) and the conflict semantics surfaced to HTTP as `409`.


