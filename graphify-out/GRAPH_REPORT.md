# Graph Report - AEiG  (2026-10-04)

## Corpus Check
- 63 files · ~10,002 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 301 nodes · 591 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 72 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9031ae7`
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
- toFlow.ts

## God Nodes (most connected - your core abstractions)
1. `NewRouter()` - 19 edges
2. `doReq()` - 16 edges
3. `main()` - 11 edges
4. `TypeStyleMap` - 11 edges
5. `routerWithLayouts()` - 10 edges
6. `writeJSON()` - 10 edges
7. `writeError()` - 10 edges
8. `NewGraphService()` - 10 edges
9. `ApiClient` - 10 edges
10. `stubElementStore` - 9 edges

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

## Communities (19 total, 3 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.10
Nodes (25): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, Layout (+17 more)

### Community 1 - "ElementRepo"
Cohesion: 0.10
Nodes (25): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+17 more)

### Community 2 - "GraphRepo"
Cohesion: 0.13
Nodes (20): Context, Layout, Position, Viewport, NewLayoutService(), Context, Graph, Layout (+12 more)

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.14
Nodes (16): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+8 more)

### Community 4 - "NewGraphService"
Cohesion: 0.18
Nodes (23): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+15 more)

### Community 5 - "NewRouter"
Cohesion: 0.16
Nodes (12): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+4 more)

### Community 6 - "Load"
Cohesion: 0.26
Nodes (15): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), HandlerFunc, handleGetLayout(), handleListLayouts() (+7 more)

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
Cohesion: 0.43
Nodes (5): Context, Layout, Position, Viewport, stubLayoutAPI

### Community 13 - "plugins"
Cohesion: 0.60
Nodes (4): Time, Layout, Position, Viewport

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 18 - "toFlow.ts"
Cohesion: 0.14
Nodes (19): filterFlow(), allEdges, allNodes, sg, styles, toFlowEdges(), toFlowNodes(), TypedNodeData (+11 more)

## Knowledge Gaps
- **19 isolated node(s):** `github.com/aeig/backend`, `client`, `styles`, `params`, `GraphNode` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `GraphRepo`, `NewGraphService`, `NewRouter`, `stubAPI`, `stubLayoutAPI`?**
  _High betweenness centrality (0.336) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewGraphService` to `TestGraphRepo_CreateGetBump`, `Load`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `NewGraphService()` connect `ElementRepo` to `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `doReq()` (e.g. with `TestGetLayout_404()` and `TestListLayouts_200()`) actually correct?**
  _`doReq()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `main()` (e.g. with `Load()` and `NewRouter()`) actually correct?**
  _`main()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend`, `client`, `styles` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._