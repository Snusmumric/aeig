# Visualization manifest: save-as, diff/sync, default "default" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visualizations remember their element set (manifest) and graph version: stale vizes open with a highlighted diff (ghosts for deleted, animated green for added), «Синхронизировать» adopts the current graph, a save-as button forks visualizations, and the default viz is named `default`.

**Architecture:** Migration `0005` adds `graph_version` + `nodes`/`edges` manifests and renames defaults to `default`; backend treats manifest fields as partial PUT fields (absent = unchanged) with a self-healing `default` insert; frontend gains a pure `vizDiff` module (three load modes: unbound / legacy / bound), ghost/added overlay layers with both toggles ON by default, a staleness bar, the save-as form, and the sync action. Binding refreshes ONLY via sync — every save carries it as-is.

**Tech Stack:** Go (chi, pgx, golang-migrate, testcontainers), React 19 + @xyflow/react 12, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-visualization-manifest-design.md` (binding: whole doc, incl. "Reversed earlier decisions").

## Global Constraints

- **Binding refresh only via «Синхронизировать»**: autosave and ALL save-button paths (fork / plain / overwrite) PUT the manifest fields **copied from the currently loaded viz**; sync PUTs `manifest := current subgraph`, `graphVersion := current graph version` (spec Goals 1/5, Frontend).
- PUT partial semantics: absent `graphVersion`/`nodes`/`edges` = unchanged; present = set. positions/viewport/filters remain full-write (autosave always sends them).
- **Both diff toggles ON by default** (they hide layers); ghosts bypass type filters; additions respect them; ghosts are not draggable/deletable (spec Goals 5).
- Load modes: **unbound** (manifests NULL AND positions empty → no bar, nothing hidden), **legacy** (manifests NULL AND positions non-empty → manifest := nodes with saved position entries; dead position keys → ghosts `{type:'ghost', label:id}`; edges := current), **bound** (manifests present → plain diff). Info badge «v→v'» only when `graphVersion > 0` and diff empty (spec Frontend).
- **Self-healing `default`**: any INSERT named `default` gets `is_default = true`; the 5-candidate loop and `namegen.go` are DELETED; `GET …/visualizations/default` = SELECT by is_default → INSERT → on conflict SELECT again → still none → 500 (spec Backend).
- No reserved name: `PUT …/visualizations/default` is legal. Request bodies capped at 1 MB (`http.MaxBytesReader` → 400).
- Migration `0005`: three columns + `UPDATE layouts SET name='default' WHERE is_default`; down drops the columns (rename not reconstructed).
- `archgen.py`: stable ids only (label-only edits; new nodes/edges appended at the end).
- Conventions: TDD RED→GREEN; backend unit `make test`, integration `cd backend && go test -tags=integration ./...` (Docker up); frontend `npm test` / `npx tsc -b` / `npm run lint`; conventional commits; graph refresh deferred to the final controller task.
- Parallel-wave execution (user-approved): Wave A = Tasks 1–3 (backend/), Wave B = Tasks 4–7 (frontend/ + scripts/ + seed/). Disjoint file sets; commits `--no-verify` with explicit pathspecs; retry on index.lock; wave ledgers `progress-backend.md` / `progress-frontend.md`.

## Review Focus

1. Fresh default (no positions, NULL manifests) must NOT show the bar or hide anything → vizDiff test "unbound: no bar inputs, empty diff" (Task 5).
2. Legacy row with positions-only: nodes without positions = added, dead position keys = ghosts, edges untrackable → vizDiff tests (Task 5); acceptance shape = the `…0003` fixture 35 vs 40 (Task 6 test).
3. Fork must carry the binding: new row receives the loaded manifest/version; autosave payload omits manifest fields entirely → GraphEditor tests asserting both PUT payloads (Task 7).
4. Partial PUT: absent manifest fields on an existing row leave them unchanged; explicit NULL? → treated as absent (decode `json.RawMessage`, nil when key missing) → repo integration test (Task 2).
5. Self-healing + race: PUT `default` on a default-less graph creates `is_default=true`; two concurrent TryCreate → one row → repo integration test (Task 2).

---

### Task 1 (Wave A): docs commit + domain manifest types + migration 0005

**Files:**
- Modify: `backend/internal/domain/visualization.go`
- Create: `backend/internal/storage/postgres/migrations/0005_visualization_manifest.up.sql`, `.down.sql`

**Interfaces (all later tasks consume):**
```go
type ManifestNode struct {
    Type  string  `json:"type"`
    Label string  `json:"label"`
    X, Y  float64 `json:"x"` / `json:"y"`   // two fields, tags "x" and "y"
}
type ManifestEdge struct {
    Type   string `json:"type"`
    Source string `json:"source"`
    Target string `json:"target"`
}
// Visualization += (json tags verbatim):
//   GraphVersion int64                          `json:"graphVersion"`
//   Nodes        *map[string]ManifestNode       `json:"nodes,omitempty"`
//   Edges        *map[string]ManifestEdge       `json:"edges,omitempty"`
```

- [ ] **Step 1: Commit spec + plan docs** — `git add docs/superpowers/specs/2026-11-06-visualization-manifest-design.md docs/superpowers/plans/2026-11-06-visualization-manifest.md && git commit --no-verify -m "docs(spec): visualization manifest design + plan"`
- [ ] **Step 2: Implement** the domain types and the migration:

```sql
-- 0005_visualization_manifest.up.sql
ALTER TABLE layouts
    ADD COLUMN graph_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN nodes         JSONB NULL,
    ADD COLUMN edges         JSONB NULL;
UPDATE layouts SET name = 'default' WHERE is_default;
```
`.down.sql`: drop the three columns; comment that the default-rename is not reconstructed.

- [ ] **Step 3: Verify intermediate state** — `cd backend && go build ./... 2>&1 | head` → compile errors only in storage/service/httpapi (planned); migration content applied in Task 2's tests.

### Task 2 (Wave A): `VisualizationRepo` — manifest round-trip, partial update, self-healing default

**Files:**
- Modify: `backend/internal/storage/postgres/visualization.go`
- Test: `backend/internal/storage/postgres/visualization_integration_test.go` (extend)

**Interfaces:**
- `SaveVisualization(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges []byte) (domain.Visualization, error)` — `nodes`/`edges` are raw JSON ([]byte); **nil = leave unchanged**, non-nil (incl. `null`→use `[]byte("null")` only if you choose; spec: absent = unchanged) = set. INSERT path sets `is_default = (name = 'default')` (self-healing); upsert never flips `is_default`; RETURNING includes the three new columns.
- `TryCreateDefaultVisualization(ctx, graphID) (domain.Visualization, bool, error)` — no name param; INSERT `name='default', is_default=true, graph_version=0, positions='{}', viewport='{"x":0,"y":0,"zoom":1}'`, nodes/edges NULL; `ON CONFLICT DO NOTHING`; not created → `GetDefaultVisualization`.
- `GetDefaultVisualization`, `GetVisualizationByName` — SELECT/scan the new columns (`nodes`/`edges` NULL → nil maps; `graph_version` → `GraphVersion`).

- [ ] **Step 1: Failing integration tests** (RED):
  - `TestVisualizationRepo_ManifestRoundtrip`: save with graphVersion=7 + node/edge manifests → GET returns equal maps and 7; re-save with nil manifest params + nil graphVersion → values unchanged; re-save with fresh manifests → replaced.
  - `TestVisualizationRepo_SelfHealingDefault`: on a fresh graph (no rows) `SaveVisualization(name="default", …)` → returned `IsDefault = true`; `GetDefaultVisualization` returns the same row.
  - `TestVisualizationRepo_DefaultRenameMigration`: staged `Migrate(4)` → insert `is_default` row named `default-8e1c94d1` (mimic 0004 promotion) → `RunMigrations` (applies 0005) → row renamed `default`, `is_default` still true, positions intact; down-step drops columns.
  - `TestVisualizationRepo_TryCreateDefaultRace` (rename existing): second `TryCreateDefaultVisualization` → `created=false`, same row id.
- [ ] **Step 2: Run → FAIL** (`go test -tags=integration ./internal/storage/postgres/ -run 'Visualization' -v`).
- [ ] **Step 3: Implement** per Interfaces; scan paths gain the three columns.
- [ ] **Step 4: Run → PASS** (all Visualization suites incl. existing).
- [ ] **Step 5: Commit** — `feat(be): migration 0005 + manifest round-trip and self-healing default` (pathspec `backend/`).

### Task 3 (Wave A): service + httpapi — drop loop/namegen/reserved, manifest passthrough, 1 MB guard

**Files:**
- Modify: `backend/internal/service/visualization.go`; **delete** `backend/internal/service/namegen.go`
- Modify: `backend/internal/httpapi/visualization.go`
- Test: `backend/internal/service/visualization_test.go` (update: delete namegen/exhausted/reserved tests), `backend/internal/httpapi/visualization_test.go` (update)

**Interfaces:**
- Service `SaveVisualization(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool, graphVersion *int64, nodes, edges []byte)` — reserved check deleted; blank name → 400; graph-exists check kept; passthrough.
- Service `GetDefaultVisualization(ctx, graphID)`: graph-exists → `TryCreateDefaultVisualization` → created: return; not created: return found row; not found after re-SELECT: plain error (500).
- httpapi PUT request += `GraphVersion *int64 \`json:"graphVersion"\``, `Nodes, Edges json.RawMessage`; handler wraps `r.Body` with `http.MaxBytesReader(w, r.Body, 1<<20)` before decode; GET/PUT responses now carry `graphVersion/nodes/edges` (domain tags already do).

- [ ] **Step 1: Failing unit tests** (RED): service — default single-shot (create / race-lost / re-SELECT-none → error), save `default` passes through (no reserved rejection, name allowed), manifest params forwarded verbatim; httpapi — PUT with `graphVersion/nodes/edges` decodes and forwards; PUT body > 1 MB → 400; PUT `default` → 201 (no 400); GET default response JSON contains `graphVersion`.
- [ ] **Step 2: Run → FAIL** (`go test ./internal/service/ ./internal/httpapi/ -run 'Visualization|Default|Manifest' -v`).
- [ ] **Step 3: Implement**; delete `namegen.go` + its tests + exhausted-loop test; update reserved-name tests to the new expectation.
- [ ] **Step 4: Run → PASS**; `go build ./... && go vet ./... && make test` green; full integration green.
- [ ] **Step 5: Commit** — `feat(be): manifest passthrough, self-healing default, 1MB guard; namegen removed`.

### Task 4 (Wave B): frontend client + types

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces (Task 5/7 consume):**
```ts
export interface ManifestNode { type: string; label: string; x: number; y: number }
export interface ManifestEdge { type: string; source: string; target: string }
// Visualization += graphVersion: number; nodes?: Record<string, ManifestNode> | null;
//                   edges?: Record<string, ManifestEdge> | null
// saveVisualization 8th optional param:
//   manifest?: { graphVersion: number; nodes: Record<string, ManifestNode>;
//                edges: Record<string, ManifestEdge> }
// — included in the PUT body only when provided.
```

- [ ] **Step 1: Failing tests**: PUT without manifest → body lacks the keys; with manifest → body carries them verbatim. RED → implement → GREEN (`npx vitest run src/api/`). Commit — `feat(fe): manifest fields on visualization client`.

### Task 5 (Wave B): pure `vizDiff` module + `useGraph.allEdges`

**Files:**
- Create: `frontend/src/graph/vizDiff.ts`; Test: `frontend/src/graph/vizDiff.test.ts`
- Modify: `frontend/src/graph/useGraph.ts` (+ expose `allEdges: Edge<TypedEdgeData>[]` in UseGraph/return; extend one useGraph test to assert it)

**Interfaces:**
```ts
export type VizDiffMode = 'unbound' | 'legacy' | 'bound'
export interface VizDiff {
  mode: VizDiffMode
  manifestNodes: Record<string, ManifestNode>
  manifestEdges: Record<string, ManifestEdge>
  deletedNodes: ManifestNode[]        // manifest − graph
  deletedEdges: ManifestEdge[]
  addedNodeIds: Set<string>           // graph − manifest
  addedEdgeIds: Set<string>
}
export function computeVizDiff(viz: Visualization | null, nodes: GraphNode[], edges: GraphEdge[]): VizDiff
```
Mode branching: `viz.nodes != null` → bound; else `positions` non-empty (≥1 key) → legacy (manifest nodes := graph nodes having a position entry `{type,label,x,y}`; position keys without a graph node → `{type:'ghost', label:id}` at saved coords; manifest edges := current edges); else unbound (empty diff).

- [ ] **Step 1: Failing tests**: unbound (fresh viz, empty positions → empty diff, mode unbound); legacy — the `…0003` shape: 3 saved positions vs 5 graph nodes → 3 manifest, 2 added, 0 deleted; dead position key → ghost node in deletedNodes; legacy edges := current (deletedEdges always empty); bound — manifest vs graph gives node/edge diffs both ways; graph nodes with positions absent from manifest (bound) → added. RED → implement → GREEN. Commit — `feat(fe): vizDiff pure module (unbound/legacy/bound)`.

### Task 6 (Wave B): GraphEditor — staleness bar, layers, save-as, sync

**Files:**
- Modify: `frontend/src/graph/GraphEditor.tsx`, `frontend/src/graph/GraphCanvas.tsx` (ghost/added styling pass-through if needed)
- Create: `frontend/src/graph/VizDiffBar.tsx` (bar + toggles + sync button)
- Test: `frontend/src/graph/GraphEditor.test.tsx`, `frontend/src/graph/VizDiffBar.test.tsx`

**Interfaces:**
- `VizDiffBarProps { deletedCount, addedCount, showDeleted, showAdded, onToggleDeleted, onToggleAdded, onSync }` — toggles render «Удалённое (N)» / «Новое (M)» with `aria-pressed`, both pressed by default; sync button «Синхронизировать».
- GraphEditor internal: `showDeleted/showAdded` state (true/true); ghost nodes → ReactFlow nodes `{id, type:'ghost', position, draggable:false, deletable:false, data:{label}}`; added nodes/edges get `className:'added'` and edges `animated:true, style:{stroke:'#22c55e', strokeWidth:2}`; ghost edges dashed `#ef4444`; CSS in `App.css` (`.react-flow__node.ghost {opacity:.45; outline:2px dashed #ef4444}`, `.react-flow__node.added {outline:2px dashed #22c55e}`).
- Save button «Сохранить визуализацию» → inline form (input prefilled `vizName`, ОК/Отмена): free name → PUT (positions/viewport/filters + manifest copied from loaded viz) → setVizName + URL rewrite; existing name (GET 200) and ≠ current → `window.confirm('Перезаписать?')` → PUT on ok; same name → PUT with copied manifest.
- Sync handler → PUT manifest := `{graphVersion: version, nodes: from allNodes (all, unfiltered) {type,label,x,y}, edges: from allEdges {type,source,target}}` → update local viz binding → diff clears, dirty=false.

- [ ] **Step 1: Failing tests** (fake timers where autosave involved; the `…0003`-shaped fixture 35-pos style: reuse small 3/5 fixture):
  - 'stale legacy viz shows diff bar with counts and highlighted additions visible by default' (added node present with `.added` class; ghost fixture: dead position key → ghost node rendered)
  - 'toggles hide and show the layers' (both aria-pressed=true initially; click «Новое» → added node gone)
  - 'save-as free name forks with binding carried' (PUT args include manifest fields equal to loaded viz; URL rewritten to new name; badge updates)
  - 'save-as existing name confirms overwrite' (confirm mocked true → PUT; false → no PUT)
  - 'autosave payload omits manifest fields' (dirty via filter → advance 10 s → args[7] undefined)
  - 'sync PUTs manifest := subgraph and version := current' (args[7] deep-equal built-from-graph manifest; diff bar disappears after resolve; dead position keys pruned — subsequent save payload lacks them)
- [ ] **Step 2: Run → FAIL**; **Step 3: Implement** per Interfaces; **Step 4: Run → PASS** + whole suite + `npx tsc -b` + `npm run lint`. Commit — `feat(fe): visualization diff layers, save-as, sync`.

### Task 7 (Wave B): archgen self-description

**Files:**
- Modify: `scripts/archgen.py`; regenerate `seed/aeig-arch-graph.{sql,cypher}`

- [ ] **Step 1: Model edits (ids stable)**: `tbl-layouts` += `fld-layouts-graph-version` (`graph_version BIGINT` — версия графа последнего sync), `fld-layouts-nodes` (`nodes JSONB` — манифест узлов), `fld-layouts-edges` (`edges JSONB` — манифест рёбер), all `has_field`; `ent-layout` label → `Visualization (manifest)`; += `ent-manifest-nodes`, `ent-manifest-edges` (`entity`, `part_of` → ent-layout, `serializes` → новые поля); `fld-layouts-name` note: «default — имя дефолтной визуализации». New nodes/edges appended at the END of NODES/EDGES.
- [ ] **Step 2: `make arch-regen`** (dev DB is up on PG_PORT=5433 — run with `PG_PORT=5433`; verify Elements grew by exactly 5, existing ids untouched, `layouts` row for …0003 keeps its positions). Commit — `feat: self-description — manifest fields (stable ids)`.

### Task 8 (controller): live DB, demo, final review

- [ ] **Step 1**: restart the running dev backend (kill the controller-owned `go run` shell; start fresh with `PG_PORT=5433` env so `RunMigrations` applies 0005 through golang-migrate — no manual psql this time); verify: `layouts` row …0003 renamed `default`, three columns present, `schema_migrations` = 5|f.
- [ ] **Step 2**: full suites (backend unit+integration, frontend test/tsc/lint/build).
- [ ] **Step 3**: wave reviews → final whole-branch review → fix wave if needed (per SDD).
- [ ] **Step 4**: `make graph-refresh` + commit; hand the demo to the user: open `…0003` → bar «+5 появилось», 5 green animated nodes, sync → adopted.
