# Edge layout: dynamic anchors + draggable bend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edges attach to the side of a node facing the other node (no hooks) and can be bent by dragging (grab points at 25/50/75%), with bends persisted in the visualization.

**Architecture:** Stage 1 (anchors) is frontend-only: 8 handles per node + a pure `pickHandles` rule applied when display edges are derived. Stage 2 adds a custom `curvy` edge type (quadratic Bézier, through-point semantics `C = M + 2·offset`, per-t inverse drag), a `bends` map in `useGraph`, and persistence via a new `bends` JSONB column (migration `0006`, partial-PUT: absent = unchanged, present = full replace; autosave always sends the live-edge map → self-pruning).

**Tech Stack:** Go (pgx, golang-migrate, testcontainers), React 19 + @xyflow/react 12 (custom EdgeType), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-edge-layout-design.md` (binding in full, incl. the builder-check resolutions in "curvy edge component").

## Global Constraints

- **Through-point semantics (factor 2!)**: persisted `{dx,dy}` is the displacement of the point the curve passes through; control point `C = M + 2·offset`; drag uses the per-t inverse `C = (P − (1−u)²S − u²E)/(2u(1−u))`, `offset = (C − M)/2` (at u=0.5 → `offset = P − M`). Tests must pin the factor-2 relation and the inverse round-trip at u ∈ {0.25, 0.5, 0.75}.
- **Every displayed edge is `curvy`**; unbent (no bend entry) renders a straight segment — the global default look changes from bezier bow to straight; dblclick-reset returns to straight.
- Anchor rule: direction between estimated centers (`position + EST_CENTER = {x:50, y:25}`); `|dx| ≥ |dy|` → horizontal sides, else vertical; exit toward neighbor, entry facing back; `d == 0` → horizontal; **self-loop (source==target) gets implicit render-time bend `{dx:0, dy:-60}` unless user-bent (not persisted)**.
- Persistence: migration `0006` `ALTER TABLE layouts ADD COLUMN bends JSONB NULL;`; PUT `bends` absent = unchanged, present = full replace; autosave/explicit saves/sync always send the map built from current `allEdges` (self-pruning); fork/overwrite carry current bends; ghost edges read-only (anchors yes, no grab/dblclick).
- Client arg shape: `saveVisualization(id, name, positions, viewport, nodeTypes, edgeTypes, hideOrphans, opts?: { manifest?: VisualizationManifest; bends?: Record<string, Bend> })` — existing callers updated; PUT body carries `bends` only when provided.
- Go: `type Bend struct { Dx float64 `json:"dx"`; Dy float64 `json:"dy"` }`; `Visualization.Bends *map[string]Bend `json:"bends,omitempty"``; repo/service/httpapi passthrough exactly like `nodes`/`edges` (`json.RawMessage`, 1 MB cap unchanged).
- `archgen.py`: stable ids, append-at-end; +2 nodes (`fld-layouts-bends`, `ent-edge-bends`), +3 edges (`has_field`, `serializes`, `part_of`); `PG_PORT=5433 make arch-regen`; live-DB verification.
- Conventions: TDD RED→GREEN; backend `make test` / `go test -tags=integration ./...`; frontend `npm test` / `npx tsc -b` / `npm run lint`; conventional commits; graph refresh deferred to controller Task 8.
- Parallel-wave execution (user-approved): Wave A = Tasks 1–2 (backend/), Wave B = Tasks 3–7 (frontend/ + scripts/ + seed/). Disjoint trees; `--no-verify` + pathspecs; index.lock retry; wave ledgers `progress-backend.md` / `progress-frontend.md`.

## Review Focus

1. Factor-2 semantics regression (persisted offset must never become control-point displacement) → edgeGeometry tests pin `C = M + 2·off` and `curve(0.5) = M + off` (Task 3).
2. Per-t inverse at outer circles (u=0.25/0.75) must reproduce the same offset as u=0.5 for the same target point set → edgeGeometry round-trip test (Task 3).
3. `bends` partial/full-replace + self-pruning: absent field leaves DB unchanged; dead-edge bend vanishes after an autosave built from live edges → repo integration + GraphEditor test (Tasks 2, 7).
4. Anchor boundary: `|dx| == |dy|` → horizontal (pin `≥`), all four quadrants, re-anchor when a node moves (memo dependency) → useGraph tests (Task 6).
5. Straight-by-default: an unbent `curvy` edge's path is the straight segment (no residual bow) → CurvyEdge path assertion (Task 7).

---

### Task 1 (Wave A): docs commit + migration 0006 + domain `Bend`

**Files:**
- Modify: `backend/internal/domain/visualization.go`
- Create: `backend/internal/storage/postgres/migrations/0006_edge_bends.up.sql`, `.down.sql`

**Interfaces (Task 2 consumes):**
```go
type Bend struct {
    Dx float64 `json:"dx"`
    Dy float64 `json:"dy"`
}
// Visualization +=  Bends *map[string]Bend `json:"bends,omitempty"`
```

- [ ] **Step 1: Commit docs** — `git add docs/superpowers/specs/2026-11-07-edge-layout-design.md docs/superpowers/plans/2026-11-07-edge-layout.md && git commit --no-verify -m "docs(spec): edge layout design + plan"`
- [ ] **Step 2: Implement** domain type + migration (`ADD COLUMN bends JSONB NULL`; down: drop).
- [ ] **Step 3: Verify intermediate** — `go build ./...` errors only in storage/service/httpapi (or none if purely additive — note either way).

### Task 2 (Wave A): bends through repo/service/httpapi

**Files:**
- Modify: `backend/internal/storage/postgres/visualization.go`, `backend/internal/service/visualization.go`, `backend/internal/httpapi/visualization.go`
- Test: `visualization_integration_test.go`, `visualization_test.go` (service + httpapi, extend)

**Interfaces:**
- Repo `SaveVisualization(…, graphVersion *int64, nodes, edges, bends []byte)` — `bends` nil = unchanged, non-nil = full replace (same SQL pattern as nodes/edges); INSERT path writes it; scan returns `Bends` (NULL → nil).
- Service passthrough; httpapi PUT request += `Bends json.RawMessage \`json:"bends"\``.

- [ ] **Step 1: Failing tests**: integration — bends round-trip (NULL ↔ map ↔ full replace; absent leaves unchanged; empty map `{}` replaces to empty); unit — service forwards raw; httpapi decodes `bends` and returns it in PUT/GET responses.
- [ ] **Step 2: RED** → **Step 3: implement** → **Step 4: GREEN** (`make test` + `go test -tags=integration ./...` + `go vet ./...`).
- [ ] **Step 5: Commit** — `feat(be): visualization bends column and partial PUT passthrough`.

### Task 3 (Wave B): `edgeGeometry.ts` pure module

**Files:**
- Create: `frontend/src/graph/edgeGeometry.ts`; Test: `frontend/src/graph/edgeGeometry.test.ts`

**Interfaces (Tasks 5–7 consume):**
```ts
export type Side = 't' | 'r' | 'b' | 'l'
export interface Bend { dx: number; dy: number }
export const EST_CENTER = { x: 50, y: 25 }
export function pickHandles(p1: {x,y}, p2: {x,y}): { source: Side; target: Side }
export function quadControl(s: Pt, e: Pt, off: Bend): Pt      // M + 2·off
export function quadPoint(s: Pt, c: Pt, e: Pt, u: number): Pt  // Bézier point at u
export function bendFromPointer(s: Pt, e: Pt, u: number, p: Pt): Bend  // per-t inverse
```

- [ ] **Step 1: Failing tests**: pickHandles table — 4 quadrants, boundary `|dx|==|dy|` → horizontal, coincident → horizontal, self-loop inputs; quadControl factor-2 (`quadPoint(s, quadControl(s,e,off), e, 0.5) === mid+off`); bendFromPointer round-trip at u ∈ {0.25, 0.5, 0.75} (pointer placed at `quadPoint(...)` reproduces `off`); u=0.5 shortcut `p − mid`.
- [ ] **Step 2: RED** → **Step 3: implement** → **Step 4: GREEN**. Commit — `feat(fe): edgeGeometry — anchor picking and bend math`.

### Task 4 (Wave B): client + types — `bends` and the `opts` bag

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`; Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- `Visualization += bends?: Record<string, Bend> | null`; `saveVisualization(…, opts?: { manifest?: VisualizationManifest; bends?: Record<string, Bend> })` — body carries `manifest` fields and/or `bends` only when provided; update ALL existing call sites (GraphEditor) mechanically in Task 7's files? NO — call sites break tsc until Task 7; keep `manifest` accepted as before AND add `bends` (backwards-compatible signature: the current 8th param name changes from `manifest` to `opts` with same field inside → update call sites NOW in GraphEditor (mechanical rename `manifest` → `{ manifest }`), leaving bends wiring to Task 7.

- [ ] **Step 1: Failing tests**: body includes `bends` when provided (verbatim), omits when absent; `opts.manifest` still carried. RED → implement + update GraphEditor call sites mechanically → GREEN (`npm test` whole suite + `npx tsc -b`). Commit — `feat(fe): client carries visualization bends`.

### Task 5 (Wave B): Stage 1 — handles + dynamic anchors

**Files:**
- Modify: `frontend/src/graph/TypedNode.tsx`, `frontend/src/graph/useGraph.ts`; Tests: `TypedNode.test.tsx`, `useGraph.test.tsx`

**Interfaces:**
- TypedNode renders 8 `<Handle>` (source+target × `t/r/b/l` ids), near-invisible (CSS class in `App.css`).
- useGraph display-edges memo: after `filterFlow`, enrich each edge with `pickHandles(nodePos(source)+EST_CENTER, nodePos(target)+EST_CENTER)` → `sourceHandle`/`targetHandle`; positions from `allNodes` (memo dep — re-anchors on moves); self-loop → `data.selfLoop = true`.

- [ ] **Step 1: Failing tests**: TypedNode — 8 handles with ids present; useGraph — node right of source → `sourceHandle:'r', targetHandle:'l'`; node below → `'b'/'t'`; boundary equal → horizontal; self-loop flagged; moving a node (position change) flips the pair.
- [ ] **Step 2: RED** → **Step 3: implement** → **Step 4: GREEN**. Commit — `feat(fe): dynamic side anchors for edges`.

### Task 6 (Wave B): Stage 2 — `curvy` edge, drag, bends state

**Files:**
- Create: `frontend/src/graph/CurvyEdge.tsx`, test `CurvyEdge.test.tsx`
- Modify: `frontend/src/graph/useGraph.ts` (bends state + `data.bend` enrichment + self-loop default `{0,-60}`), `GraphCanvas.tsx` (edgeTypes + `onEdgeBend` prop), `GraphEditor.tsx` (wire setBends, dirty on bend change, autosave/`saveArgs` include `bends: bendsFromLiveEdges`, viz load seeds bends), `App.css` (grab-circle styles)

**Interfaces:**
- `useGraph` += `bends: Record<string, Bend>`, `setBends: Dispatch<SetStateAction<…>>`; edges memo sets `data.bend = bends[id] ?? (selfLoop ? {dx:0,dy:-60} : {dx:0,dy:0})` and `data.readOnly` for ghost edges is GraphEditor's overlay concern (ghost edges built in GraphEditor get `data.readOnly = true`).
- `CurvyEdge` (EdgeProps): path `M s Q c e` with `c = quadControl(s, e, data.bend)`; label (edge type) at `quadPoint(0.5)` via `EdgeText`; if `!data.readOnly` → three circles at u∈{.25,.5,.75} (`r=6`, hover-visible class `data-testid="edge-grab-<id>-<u>"`); pointerdown → capture + `screenToFlowPosition` on move → `bendFromPointer(s, e, u, flowPos)` → `onEdgeBend(id, bend)`; dblclick on path → `onEdgeBend(id, null)`.
- GraphCanvas prop `onEdgeBend?: (edgeId: string, bend: Bend | null) => void`; GraphEditor: setBends + markDirty; `saveArgs` grows `bends` (built from `allEdges` live ids — including entries being removed: full current map state filtered to live edges).

- [ ] **Step 1: Failing tests**:
  - CurvyEdge (unit, plain pointer events — no d3): unbent path is the straight segment (`d` attribute = `M..L`-equivalent quad with zero offset — pin exact string); bend offset applied (`C = M + 2·off` visible in `d`); drag circle u=0.5: pointerdown/move(+30,+10)/up → `onEdgeBend(id, {dx:30, dy:10})`; dblclick → `onEdgeBend(id, null)`; `data.readOnly` renders no circles.
  - useGraph: bends map flows into `data.bend`; self-loop default `{0,-60}`.
  - GraphEditor: bend change marks dirty → autosave PUT `opts.bends` deep-equal live map; dblclick-removed edge id absent from the next autosave payload; viz load (`bends` in fixture) seeds state.
- [ ] **Step 2: RED** → **Step 3: implement** → **Step 4: GREEN** + full gate (`npm test && npx tsc -b && npm run lint`). Commit — `feat(fe): curvy edges with draggable persisted bends`.

### Task 7 (Wave B): archgen self-description

**Files:**
- Modify: `scripts/archgen.py`; regenerate `seed/aeig-arch-graph.{sql,cypher}`

- [ ] **Step 1: Model edits (ids stable, append at END)**: `tbl-layouts` += `fld-layouts-bends` (label `bends`, datatype `JSONB`, note «изгибы рёбер — относительные офсеты {dx,dy} от середины»); `ent-edge-bends` (entity, label `EdgeBends`, note «{edgeId → {dx,dy}}; автосейв шлёт полную карту от живых рёбер»); edges: `has_field` (tbl-layouts → fld), `serializes` (ent-edge-bends → fld), `part_of` (ent-edge-bends → ent-layout).
- [ ] **Step 2: `PG_PORT=5433 make arch-regen`**; verify live: +2 Elements exactly (45→47), +3 RELs, existing ids untouched, `…0003` default viz positions intact. Commit — `feat: self-description — bends field (stable ids)`.

### Task 8 (controller): live DB, reviews, demo

- [ ] **Step 1**: restart the dev backend (controller-owned `go run`; `RunMigrations` applies 0006 via golang-migrate); verify `bends` column + `schema_migrations` = 6|f.
- [ ] **Step 2**: full suites (backend unit+integration; frontend test/tsc/lint/build).
- [ ] **Step 3**: wave reviews (2 parallel) → fix waves → final whole-branch review → fix wave per SDD.
- [ ] **Step 4**: `make graph-refresh` + commit; demo to the user: open `…0003` — straight clean edges with correct anchors; drag an edge's midpoint → bend persists after reload (F5); dblclick resets.
