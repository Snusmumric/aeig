# Graph Report - AEiG  (2026-10-04)

## Corpus Check
- 61 files · ~9,410 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 299 nodes · 561 edges · 22 communities (16 shown, 6 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7901ded8`
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
- stubLayoutAPI
- Mutations
- client.ts
- plugins
- errors.go
- github.com/aeig/backend
- ResizeObserverMock
- LayoutService
- HandlerFunc
- Handler
- Graph

## God Nodes (most connected - your core abstractions)
1. `NewRouter()` - 18 edges
2. `main()` - 11 edges
3. `doReq()` - 10 edges
4. `NewGraphService()` - 10 edges
5. `ApiClient` - 10 edges
6. `routerWithLayouts()` - 9 edges
7. `stubElementStore` - 9 edges
8. `stubAPI` - 8 edges
9. `GraphService` - 8 edges
10. `ElementRepo` - 8 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/config/config.go
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go
- `main()` --calls--> `NewGraphService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/graph.go
- `main()` --calls--> `NewLayoutService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/layout.go
- `main()` --calls--> `NewDriver()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/driver.go

## Import Cycles
- None detected.

## Communities (22 total, 6 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.07
Nodes (41): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, Layout (+33 more)

### Community 1 - "ElementRepo"
Cohesion: 0.10
Nodes (25): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+17 more)

### Community 2 - "GraphRepo"
Cohesion: 0.21
Nodes (12): Context, Layout, Position, T, Viewport, TestLayoutService_SaveEmptyName(), TestLayoutService_SaveOK(), TestLayoutService_SavePassesNodeTypes() (+4 more)

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.14
Nodes (16): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+8 more)

### Community 4 - "NewGraphService"
Cohesion: 0.18
Nodes (20): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+12 more)

### Community 5 - "NewRouter"
Cohesion: 0.16
Nodes (12): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+4 more)

### Community 6 - "Load"
Cohesion: 0.47
Nodes (9): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON() (+1 more)

### Community 7 - "stubAPI"
Cohesion: 0.28
Nodes (9): Context, Layout, Pool, Position, Viewport, NewLayoutRepo(), scanLayout(), LayoutRepo (+1 more)

### Community 8 - "devDependencies"
Cohesion: 0.29
Nodes (5): GraphCanvas(), GraphCanvasProps, nodeTypes, shapeStyle(), TypedNode()

### Community 9 - "compilerOptions"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 10 - "stubLayoutAPI"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

### Community 11 - "Mutations"
Cohesion: 0.22
Nodes (14): Context, Layout, Position, T, Viewport, routerWithLayouts(), TestGetLayout_404(), TestListLayouts_200() (+6 more)

### Community 13 - "plugins"
Cohesion: 0.60
Nodes (4): Time, Layout, Position, Viewport

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 18 - "LayoutService"
Cohesion: 0.30
Nodes (8): Context, Layout, Position, Viewport, NewLayoutService(), GraphExistence, LayoutService, LayoutStore

## Knowledge Gaps
- **18 isolated node(s):** `github.com/aeig/backend`, `client`, `styles`, `params`, `GraphNode` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `NewGraphService`, `NewRouter`, `stubAPI`, `stubLayoutAPI`, `LayoutService`?**
  _High betweenness centrality (0.276) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewGraphService` to `TestGraphRepo_CreateGetBump`, `Load`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Why does `NewGraphService()` connect `ElementRepo` to `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `main()` (e.g. with `Load()` and `NewRouter()`) actually correct?**
  _`main()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `NewGraphService()` (e.g. with `main()` and `TestApplyMutations_BumpsFirstThenApplies()`) actually correct?**
  _`NewGraphService()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend`, `client`, `styles` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._