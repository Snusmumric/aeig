# Graph Report - AEiG  (2026-11-06)

## Corpus Check
- 66 files · ~16,006 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 334 nodes · 686 edges · 20 communities (17 shown, 3 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a84b7686`
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
- client.ts
- plugins
- errors.go
- github.com/aeig/backend
- ResizeObserverMock
- toFlow.ts
- App.tsx
- T
- Load

## God Nodes (most connected - your core abstractions)
1. `NewRouter()` - 19 edges
2. `doReq()` - 18 edges
3. `NewVisualizationService()` - 15 edges
4. `useGraph` - 13 edges
5. `routerWithVisualizations()` - 12 edges
6. `main()` - 11 edges
7. `TypeStyleMap` - 11 edges
8. `writeJSON()` - 10 edges
9. `writeError()` - 10 edges
10. `NewGraphService()` - 10 edges

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
Cohesion: 0.10
Nodes (23): ApiClient, ApiError, createClient(), request(), Graph, GraphEdge, GraphNode, Mutations (+15 more)

### Community 1 - "ElementRepo"
Cohesion: 0.10
Nodes (25): Context, Graph, Mutations, Subgraph, NewGraphService(), edgeIDs(), Context, Graph (+17 more)

### Community 2 - "GraphRepo"
Cohesion: 0.17
Nodes (11): Rand, NewVizName(), Context, Position, Rand, Viewport, Visualization, Mutex (+3 more)

### Community 3 - "TestGraphRepo_CreateGetBump"
Cohesion: 0.15
Nodes (22): main(), Context, Graph, Pool, T, startPostgres(), TestGraphRepo_CreateGetBump(), NewGraphRepo() (+14 more)

### Community 4 - "NewGraphService"
Cohesion: 0.18
Nodes (25): doReq(), Handler, T, TestApplyMutations_200(), TestApplyMutations_409OnConflict(), TestCreateGraph_201(), TestCreateGraph_400OnInvalid(), TestGetGraph_404() (+17 more)

### Community 5 - "NewRouter"
Cohesion: 0.16
Nodes (12): DriverWithContext, NewDriver(), buildProps(), Context, DriverWithContext, Subgraph, T, startNeo4j() (+4 more)

### Community 6 - "Load"
Cohesion: 0.26
Nodes (15): HandlerFunc, handleApplyMutations(), handleCreateGraph(), handleGetGraph(), handleGetSubgraph(), ResponseWriter, writeError(), writeJSON() (+7 more)

### Community 7 - "stubAPI"
Cohesion: 0.29
Nodes (8): Context, Pool, Position, Viewport, Visualization, scanVisualization(), rowScanner, VisualizationRepo

### Community 8 - "devDependencies"
Cohesion: 0.43
Nodes (5): Context, Position, Viewport, Visualization, stubVizAPI

### Community 9 - "compilerOptions"
Cohesion: 0.42
Nodes (5): Context, Graph, Mutations, Subgraph, stubAPI

### Community 13 - "plugins"
Cohesion: 0.60
Nodes (4): Time, Position, Viewport, Visualization

### Community 14 - "errors.go"
Cohesion: 0.50
Nodes (3): ResponseWriter, handleHealth(), Request

### Community 18 - "toFlow.ts"
Cohesion: 0.09
Nodes (27): filterFlow(), allEdges, allNodes, tEdges, addAdjacent(), applyFollowDrag(), planFollowers(), sg (+19 more)

### Community 19 - "App.tsx"
Cohesion: 0.29
Nodes (5): GraphCanvas(), GraphCanvasProps, nodeTypes, shapeStyle(), TypedNode()

### Community 27 - "T"
Cohesion: 0.19
Nodes (21): NewVisualizationService(), Context, Graph, Position, T, Viewport, Visualization, TestGetDefault_Creates() (+13 more)

### Community 39 - "Load"
Cohesion: 0.43
Nodes (6): Load(), T, TestLoad_DefaultsHTTPAddr(), TestLoad_MissingRequired(), TestLoad_ReadsAllVars(), Config

## Knowledge Gaps
- **21 isolated node(s):** `github.com/aeig/backend`, `client`, `styles`, `params`, `GraphNode` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `TestGraphRepo_CreateGetBump` to `ElementRepo`, `NewGraphService`, `NewRouter`, `Load`, `T`?**
  _High betweenness centrality (0.342) - this node is a cross-community bridge._
- **Why does `NewRouter()` connect `NewGraphService` to `TestGraphRepo_CreateGetBump`, `Load`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `NewVisualizationService()` connect `T` to `GraphRepo`, `TestGraphRepo_CreateGetBump`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `NewRouter()` (e.g. with `main()` and `TestApplyMutations_200()`) actually correct?**
  _`NewRouter()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `doReq()` (e.g. with `TestGetDefaultVisualization_200()` and `TestGetVisualization_200()`) actually correct?**
  _`doReq()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `NewVisualizationService()` (e.g. with `main()` and `TestGetDefault_Creates()`) actually correct?**
  _`NewVisualizationService()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/aeig/backend`, `client`, `styles` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._