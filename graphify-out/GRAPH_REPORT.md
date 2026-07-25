# Graph Report - AEiG  (2026-07-25)

## Corpus Check
- 19 files · ~1,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 66 nodes · 88 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `af091543`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией
- ElementRepo
- GraphRepo
- TestGraphRepo_CreateGetBump
- NewRouter
- Load
- TestElementRepo_UpsertAndGetSubgraph
- handleHealth
- github.com/aeig/backend

## God Nodes (most connected - your core abstractions)
1. `ElementRepo` - 8 edges
2. `Load()` - 6 edges
3. `GraphRepo` - 6 edges
4. `TestGraphRepo_CreateGetBump()` - 6 edges
5. `TestElementRepo_UpsertAndGetSubgraph()` - 5 edges
6. `Subgraph` - 4 edges
7. `Graph` - 4 edges
8. `NewRouter()` - 4 edges
9. `NewElementRepo()` - 4 edges
10. `NewGraphRepo()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/config/config.go
- `TestElementRepo_UpsertAndGetSubgraph()` --calls--> `NewElementRepo()`  [INFERRED]
  backend/internal/storage/neo4j/elements_integration_test.go → backend/internal/storage/neo4j/elements.go
- `TestGraphRepo_CreateGetBump()` --calls--> `NewGraphRepo()`  [INFERRED]
  backend/internal/storage/postgres/graphs_integration_test.go → backend/internal/storage/postgres/graphs.go
- `TestGraphRepo_CreateGetBump()` --calls--> `RunMigrations()`  [INFERRED]
  backend/internal/storage/postgres/graphs_integration_test.go → backend/internal/storage/postgres/migrate.go
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.83
Nodes (3): Edge, Node, Subgraph

### Community 1 - "ElementRepo"
Cohesion: 0.30
Nodes (6): buildProps(), Context, DriverWithContext, NewElementRepo(), userProps(), ElementRepo

### Community 2 - "GraphRepo"
Cohesion: 0.29
Nodes (6): Context, Pool, NewGraphRepo(), Graph, GraphRepo, Time

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.24
Nodes (7): T, startPostgres(), TestGraphRepo_CreateGetBump(), RunMigrations(), Context, Pool, NewPool()

### Community 5 - "NewRouter"
Cohesion: 0.25
Nodes (5): main(), T, TestHealth_OK(), NewRouter(), Handler

### Community 6 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

### Community 10 - "TestElementRepo_UpsertAndGetSubgraph"
Cohesion: 0.38
Nodes (5): DriverWithContext, NewDriver(), T, startNeo4j(), TestElementRepo_UpsertAndGetSubgraph()

### Community 11 - "handleHealth"
Cohesion: 0.50
Nodes (3): handleHealth(), Request, ResponseWriter

## Knowledge Gaps
- **1 isolated node(s):** `github.com/aeig/backend`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TestGraphRepo_CreateGetBump()` connect `TestGraphRepo_CreateGetBump` to `GraphRepo`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `NewElementRepo()` connect `ElementRepo` to `TestElementRepo_UpsertAndGetSubgraph`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Load()` (e.g. with `main()` and `TestLoad_DefaultsHTTPAddr()`) actually correct?**
  _`Load()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `TestGraphRepo_CreateGetBump()` (e.g. with `NewGraphRepo()` and `RunMigrations()`) actually correct?**
  _`TestGraphRepo_CreateGetBump()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._