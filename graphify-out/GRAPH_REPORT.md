# Graph Report - AEiG  (2026-11-06)

## Corpus Check
- 71 files · ~21,860 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 359 nodes · 774 edges · 19 communities (16 shown, 3 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 123 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b9a34fdf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией
- ElementRepo
- TestGraphRepo_CreateGetBump
- NewGraphService
- NewRouter
- Load
- stubAPI
- devDependencies
- compilerOptions
- client.ts
- plugins
- errors.go
- github.com/aeig/backend
- ResizeObserverMock
- App.tsx
- T
- Load
- GraphCanvas.tsx

## God Nodes (most connected - your core abstractions)
1. `doReq()` - 20 edges
2. `NewRouter()` - 19 edges
3. `NewVisualizationService()` - 15 edges
4. `NewGraphRepo()` - 15 edges
5. `NewPool()` - 15 edges
6. `routerWithVisualizations()` - 14 edges
7. `NewVisualizationRepo()` - 14 edges
8. `startPostgres()` - 13 edges
9. `RunMigrations()` - 13 edges
10. `useGraph` - 13 edges

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

## Communities (19 total, 3 thin omitted)

### Community 0 - "AEiG — Дизайн: браузерный редактор типизированных графов с метамоделями и валидацией"
Cohesion: 0.07
Nodes (32): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, ManifestEdge (+24 more)

### Community 1 - "ElementRepo"
Cohesion: 0.10
Nodes (25): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+17 more)

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.17
Nodes (28): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+20 more)

### Community 4 - "NewGraphService"
Cohesion: 0.17
Nodes (27): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+19 more)

### Community 5 - "NewRouter"
Cohesion: 0.16
Nodes (12): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+4 more)

### Community 6 - "Load"
Cohesion: 0.26
Nodes (15): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON() (+7 more)

### Community 7 - "stubAPI"
Cohesion: 0.26
Nodes (9): decodeManifest(), Context, Position, T, Viewport, Visualization, scanVisualization(), rowScanner (+1 more)

### Community 8 - "devDependencies"
Cohesion: 0.43
Nodes (5): Context, Position, Viewport, Visualization, stubVizAPI

### Community 9 - "compilerOptions"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 13 - "plugins"
Cohesion: 0.48
Nodes (6): Time, ManifestEdge, ManifestNode, Position, Viewport, Visualization

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 19 - "App.tsx"
Cohesion: 0.09
Nodes (28): Subgraph, filterFlow(), allEdges, allNodes, tEdges, addAdjacent(), applyFollowDrag(), planFollowers() (+20 more)

### Community 27 - "T"
Cohesion: 0.12
Nodes (27): Context, Position, Viewport, Visualization, NewVisualizationService(), Context, Graph, Position (+19 more)

### Community 33 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

### Community 35 - "GraphCanvas.tsx"
Cohesion: 0.25
Nodes (5): GraphCanvas(), GraphCanvasProps, nodeTypes, shapeStyle(), TypedNode()

## Knowledge Gaps
- **20 isolated node(s):** `github.com/aeig/backend`, `client`, `styles`, `params`, `nodeTypes` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `Load`, `ElementRepo`, `NewGraphService`, `NewRouter`, `T`?**
  _High betweenness centrality (0.300) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewGraphService` to `TestGraphRepo_CreateGetBump`, `Load`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `NewVisualizationService()` connect `T` to `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `doReq()` (e.g. with `TestGetDefaultVisualization_200()` and `TestGetVisualization_200()`) actually correct?**
  _`doReq()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `NewVisualizationService()` (e.g. with `main()` and `TestGetDefault_Creates()`) actually correct?**
  _`NewVisualizationService()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `NewGraphRepo()` (e.g. with `main()` and `TestGraphRepo_CreateGetBump()`) actually correct?**
  _`NewGraphRepo()` has 12 INFERRED edges - model-reasoned connections that need verification._