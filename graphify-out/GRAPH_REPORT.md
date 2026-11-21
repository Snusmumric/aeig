# Graph Report - AEiG  (2026-11-21)

## Corpus Check
- 94 files · ~41,555 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 527 nodes · 1231 edges · 22 communities (19 shown, 3 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 210 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f18b909d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией
- ElementRepo
- NewVisualizationRepo
- TestGraphRepo_CreateGetBump
- NewGraphService
- NewRouter
- Load
- devDependencies
- compilerOptions
- SliceRepo
- client.ts
- plugins
- errors.go
- github.com/aeig/backend
- ResizeObserverMock
- App.tsx
- App.tsx
- Load
- T
- Visualization
- GraphCanvas.tsx

## God Nodes (most connected - your core abstractions)
1. `doReq()` - 32 edges
2. `NewRouter()` - 27 edges
3. `routerWithVisualizations()` - 20 edges
4. `NewGraphRepo()` - 20 edges
5. `NewPool()` - 20 edges
6. `startPostgres()` - 18 edges
7. `RunMigrations()` - 18 edges
8. `NewVisualizationService()` - 17 edges
9. `writeError()` - 16 edges
10. `NewVisualizationRepo()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/config/config.go
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go
- `main()` --calls--> `NewGraphService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/graph.go
- `main()` --calls--> `NewSliceService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/slice.go
- `main()` --calls--> `NewVisualizationService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/visualization.go

## Import Cycles
- None detected.

## Communities (22 total, 3 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.06
Nodes (40): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, ManifestEdge (+32 more)

### Community 1 - "ElementRepo"
Cohesion: 0.09
Nodes (27): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+19 more)

### Community 2 - "NewVisualizationRepo"
Cohesion: 0.35
Nodes (5): Context, Pool, Slice, isUniqueViolation(), SliceRepo

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.16
Nodes (34): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+26 more)

### Community 4 - "NewGraphService"
Cohesion: 0.14
Nodes (38): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+30 more)

### Community 5 - "NewRouter"
Cohesion: 0.11
Nodes (26): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+18 more)

### Community 6 - "Load"
Cohesion: 0.17
Nodes (30): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), T, TestHealth_OK(), ResponseWriter (+22 more)

### Community 8 - "devDependencies"
Cohesion: 0.43
Nodes (5): Context, Position, Viewport, Visualization, stubVizAPI

### Community 9 - "compilerOptions"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 10 - "SliceRepo"
Cohesion: 0.19
Nodes (14): Context, Slice, Subgraph, T, newSliceService(), TestSliceService_AddRemoveNodes(), TestSliceService_Create(), TestSliceService_Delete() (+6 more)

### Community 13 - "plugins"
Cohesion: 0.43
Nodes (7): Time, Bend, ManifestEdge, ManifestNode, Position, Viewport, Visualization

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 19 - "App.tsx"
Cohesion: 0.07
Nodes (34): Subgraph, App(), client, params, styles, pickHandles(), filterFlow(), allEdges (+26 more)

### Community 21 - "App.tsx"
Cohesion: 0.14
Nodes (13): Context, Slice, SliceDetail, Context, Slice, SliceDetail, NewSliceService(), SliceInfo (+5 more)

### Community 26 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

### Community 27 - "T"
Cohesion: 0.12
Nodes (29): Context, Position, Viewport, Visualization, NewVisualizationService(), Context, Graph, Position (+21 more)

### Community 34 - "Visualization"
Cohesion: 0.23
Nodes (11): decodeManifest(), decodeVisibleSlices(), Context, Pool, Position, T, Viewport, Visualization (+3 more)

### Community 35 - "GraphCanvas.tsx"
Cohesion: 0.13
Nodes (17): CurvyEdge(), CurvyEdgeData, EdgeBendContext, GRAB_PARAMETERS, bendFromPointer(), EST_CENTER, Pt, quadControl() (+9 more)

## Knowledge Gaps
- **26 isolated node(s):** `github.com/aeig/backend`, `Slice`, `client`, `styles`, `params` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `NewRouter`, `Load`, `App.tsx`, `Load`, `T`?**
  _High betweenness centrality (0.328) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `Load` to `TestGraphRepo_CreateGetBump`, `NewGraphService`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Why does `NewSliceService()` connect `App.tsx` to `T`, `SliceRepo`, `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `doReq()` (e.g. with `TestSliceRoutes_Create()` and `TestSliceRoutes_Delete()`) actually correct?**
  _`doReq()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `NewGraphRepo()` (e.g. with `main()` and `TestGraphRepo_CreateGetBump()`) actually correct?**
  _`NewGraphRepo()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `NewPool()` (e.g. with `main()` and `TestGraphRepo_CreateGetBump()`) actually correct?**
  _`NewPool()` has 17 INFERRED edges - model-reasoned connections that need verification._