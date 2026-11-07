# Graph Report - AEiG  (2026-11-07)

## Corpus Check
- 77 files · ~27,569 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 388 nodes · 863 edges · 20 communities (17 shown, 3 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 132 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4cf91cdc`
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
- client.ts
- plugins
- errors.go
- github.com/aeig/backend
- ResizeObserverMock
- App.tsx
- T
- Visualization
- GraphCanvas.tsx
- Load

## God Nodes (most connected - your core abstractions)
1. `doReq()` - 23 edges
2. `NewRouter()` - 19 edges
3. `routerWithVisualizations()` - 17 edges
4. `NewVisualizationService()` - 16 edges
5. `NewGraphRepo()` - 16 edges
6. `NewPool()` - 16 edges
7. `NewVisualizationRepo()` - 15 edges
8. `useGraph` - 15 edges
9. `startPostgres()` - 14 edges
10. `RunMigrations()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `Load()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/config/config.go
- `main()` --calls--> `NewRouter()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/httpapi/router.go
- `main()` --calls--> `NewGraphService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/graph.go
- `main()` --calls--> `NewVisualizationService()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/service/visualization.go
- `main()` --calls--> `NewDriver()`  [INFERRED]
  backend/cmd/server/main.go → backend/internal/storage/neo4j/driver.go

## Import Cycles
- None detected.

## Communities (20 total, 3 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.07
Nodes (30): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, ManifestEdge (+22 more)

### Community 1 - "ElementRepo"
Cohesion: 0.10
Nodes (25): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+17 more)

### Community 2 - "NewVisualizationRepo"
Cohesion: 0.25
Nodes (24): main(), T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo(), RunMigrations(), Context, Pool (+16 more)

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.39
Nodes (4): Context, Graph, Pool, GraphRepo

### Community 4 - "NewGraphService"
Cohesion: 0.16
Nodes (30): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+22 more)

### Community 5 - "NewRouter"
Cohesion: 0.16
Nodes (12): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+4 more)

### Community 6 - "Load"
Cohesion: 0.26
Nodes (15): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON() (+7 more)

### Community 8 - "devDependencies"
Cohesion: 0.43
Nodes (5): Context, Position, Viewport, Visualization, stubVizAPI

### Community 9 - "compilerOptions"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 13 - "plugins"
Cohesion: 0.43
Nodes (7): Time, Bend, ManifestEdge, ManifestNode, Position, Viewport, Visualization

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 19 - "App.tsx"
Cohesion: 0.08
Nodes (34): Subgraph, App(), client, params, styles, pickHandles(), filterFlow(), allEdges (+26 more)

### Community 27 - "T"
Cohesion: 0.12
Nodes (28): Context, Position, Viewport, Visualization, NewVisualizationService(), Context, Graph, Position (+20 more)

### Community 34 - "Visualization"
Cohesion: 0.24
Nodes (10): decodeManifest(), Context, Pool, Position, T, Viewport, Visualization, scanVisualization() (+2 more)

### Community 35 - "GraphCanvas.tsx"
Cohesion: 0.13
Nodes (17): CurvyEdge(), CurvyEdgeData, EdgeBendContext, GRAB_PARAMETERS, bendFromPointer(), EST_CENTER, Pt, quadControl() (+9 more)

### Community 39 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

## Knowledge Gaps
- **23 isolated node(s):** `github.com/aeig/backend`, `client`, `styles`, `params`, `GRAB_PARAMETERS` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `NewVisualizationRepo` to `ElementRepo`, `NewGraphService`, `NewRouter`, `Load`, `T`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewGraphService` to `NewVisualizationRepo`, `Load`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `NewVisualizationService()` connect `T` to `NewVisualizationRepo`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `doReq()` (e.g. with `TestGetDefaultVisualization_200()` and `TestGetVisualization_200()`) actually correct?**
  _`doReq()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `NewVisualizationService()` (e.g. with `main()` and `TestGetDefault_Creates()`) actually correct?**
  _`NewVisualizationService()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `NewGraphRepo()` (e.g. with `main()` and `TestGraphRepo_CreateGetBump()`) actually correct?**
  _`NewGraphRepo()` has 13 INFERRED edges - model-reasoned connections that need verification._