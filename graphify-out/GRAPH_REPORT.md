# Graph Report - AEiG  (2026-07-25)

## Corpus Check
- 25 files · ~3,296 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 126 nodes · 244 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c31a6b9d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией
- ElementRepo
- GraphRepo
- TestGraphRepo_CreateGetBump
- NewGraphService
- NewRouter
- Load
- stubAPI
- TestElementRepo_UpsertAndGetSubgraph
- handleHealth
- github.com/aeig/backend

## God Nodes (most connected - your core abstractions)
1. `NewRouter()` - 15 edges
2. `Graph` - 12 edges
3. `doReq()` - 10 edges
4. `NewGraphService()` - 10 edges
5. `main()` - 9 edges
6. `Subgraph` - 9 edges
7. `stubElementStore` - 9 edges
8. `stubAPI` - 8 edges
9. `GraphService` - 8 edges
10. `ElementRepo` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go
- `main()` --calls--> `NewGraphService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/graph.go
- `main()` --calls--> `NewDriver()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/driver.go
- `main()` --calls--> `NewElementRepo()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/elements.go
- `main()` --calls--> `NewGraphRepo()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/postgres/graphs.go

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.17
Nodes (14): edgeIDs(), Context, T, nodeIDs(), TestApplyMutations_BumpsFirstThenApplies(), TestApplyMutations_ElementErrorPropagates(), TestApplyMutations_VersionConflict_NoElementWrites(), TestCreateGraph_EmptyName() (+6 more)

### Community 1 - "ElementRepo"
Cohesion: 0.30
Nodes (6): buildProps(), Context, DriverWithContext, NewElementRepo(), userProps(), ElementRepo

### Community 2 - "GraphRepo"
Cohesion: 0.43
Nodes (4): Context, Pool, NewGraphRepo(), GraphRepo

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.14
Nodes (14): main(), Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), T, startPostgres() (+6 more)

### Community 4 - "NewGraphService"
Cohesion: 0.40
Nodes (5): Context, NewGraphService(), ElementStore, GraphService, GraphStore

### Community 5 - "NewRouter"
Cohesion: 0.24
Nodes (14): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+6 more)

### Community 6 - "Load"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 7 - "stubAPI"
Cohesion: 0.29
Nodes (5): Context, Graph, Mutations, stubAPI, Time

### Community 10 - "TestElementRepo_UpsertAndGetSubgraph"
Cohesion: 0.38
Nodes (5): DriverWithContext, NewDriver(), T, startNeo4j(), TestElementRepo_UpsertAndGetSubgraph()

### Community 11 - "handleHealth"
Cohesion: 0.47
Nodes (9): handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON(), HandlerFunc (+1 more)

## Knowledge Gaps
- **1 isolated node(s):** `github.com/aeig/backend`
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `GraphRepo`, `NewGraphService`, `NewRouter`, `TestElementRepo_UpsertAndGetSubgraph`?**
  _High betweenness centrality (0.469) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewRouter` to `handleHealth`, `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.301) - this node is a cross-community bridge._
- **Why does `NewGraphService()` connect `NewGraphService` to `AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией`, `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `NewGraphService()` (e.g. with `main()` and `TestApplyMutations_BumpsFirstThenApplies()`) actually correct?**
  _`NewGraphService()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `main()` (e.g. with `Load()` and `NewRouter()`) actually correct?**
  _`main()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._