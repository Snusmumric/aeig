# Graph Report - AEiG  (2026-07-26)

## Corpus Check
- 38 files · ~5,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 184 nodes · 325 edges · 17 communities (14 shown, 3 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `abd86efb`
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
- devDependencies
- compilerOptions
- TestElementRepo_UpsertAndGetSubgraph
- client.ts
- plugins
- github.com/aeig/backend
- Load
- ResizeObserverMock

## God Nodes (most connected - your core abstractions)
1. `NewRouter()` - 15 edges
2. `doReq()` - 10 edges
3. `NewGraphService()` - 10 edges
4. `main()` - 9 edges
5. `stubElementStore` - 9 edges
6. `stubAPI` - 8 edges
7. `GraphService` - 8 edges
8. `ElementRepo` - 8 edges
9. `Node` - 7 edges
10. `Edge` - 7 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/config/config.go
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go
- `main()` --calls--> `NewGraphService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/graph.go
- `main()` --calls--> `NewDriver()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/driver.go
- `main()` --calls--> `NewElementRepo()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/elements.go

## Import Cycles
- None detected.

## Communities (17 total, 3 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.19
Nodes (9): Context, Graph, Subgraph, Edge, Mutations, Node, Subgraph, stubElementStore (+1 more)

### Community 1 - "ElementRepo"
Cohesion: 0.27
Nodes (7): buildProps(), Context, DriverWithContext, Subgraph, NewElementRepo(), userProps(), ElementRepo

### Community 2 - "GraphRepo"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.14
Nodes (13): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+5 more)

### Community 4 - "NewGraphService"
Cohesion: 0.18
Nodes (16): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), T, nodeIDs() (+8 more)

### Community 5 - "NewRouter"
Cohesion: 0.24
Nodes (14): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+6 more)

### Community 6 - "Load"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 7 - "stubAPI"
Cohesion: 0.47
Nodes (9): handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON(), HandlerFunc (+1 more)

### Community 8 - "devDependencies"
Cohesion: 0.27
Nodes (6): ApiClient, ApiError, createClient(), request(), Graph, Mutations

### Community 9 - "compilerOptions"
Cohesion: 0.29
Nodes (5): GraphCanvas(), GraphCanvasProps, nodeTypes, shapeStyle(), TypedNode()

### Community 10 - "TestElementRepo_UpsertAndGetSubgraph"
Cohesion: 0.38
Nodes (5): DriverWithContext, NewDriver(), T, startNeo4j(), TestElementRepo_UpsertAndGetSubgraph()

### Community 13 - "plugins"
Cohesion: 0.19
Nodes (16): GraphEdge, GraphNode, Subgraph, App(), demo, styles, sg, styles (+8 more)

### Community 16 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

## Knowledge Gaps
- **12 isolated node(s):** `github.com/aeig/backend`, `styles`, `demo`, `ApiClient`, `GraphNode` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `NewGraphService`, `NewRouter`, `TestElementRepo_UpsertAndGetSubgraph`, `Load`?**
  _High betweenness centrality (0.341) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewRouter` to `TestGraphRepo_CreateGetBump`, `stubAPI`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Why does `NewGraphService()` connect `NewGraphService` to `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `NewGraphService()` (e.g. with `main()` and `TestApplyMutations_BumpsFirstThenApplies()`) actually correct?**
  _`NewGraphService()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `main()` (e.g. with `Load()` and `NewRouter()`) actually correct?**
  _`main()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend`, `styles`, `demo` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._