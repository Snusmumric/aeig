# Graph Visualization (evolution of layouts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `layouts` into persisted **visualizations**: one lazily-created default per graph, URL `?graph=<id>&viz=<name>`, 10-second autosave of positions + viewport + all filters.

**Architecture:** Migration `0004` extends the `layouts` table (`edge_types`, `hide_orphans`, `is_default` + partial unique index) and promotes legacy `default`-named rows; backend renames the concept Layout→Visualization across domain/service/httpapi/storage with three routes; frontend replaces the manual LayoutBar with load-default-or-by-URL + interval autosave; `scripts/archgen.py` self-description updated with stable node ids.

**Tech Stack:** Go (chi, pgx, testcontainers integration tests), React 19 + @xyflow/react 12 (Vitest fake timers), Postgres migrations.

**Spec:** `docs/superpowers/specs/2026-11-06-visualization-design.md` (includes Builder-check outcomes and the Bootstrap section — both binding).

## Global Constraints

- Concept name is **visualization** everywhere new; the DB table stays `layouts` (spec: Approaches).
- Visualization state = `positions` + `viewport` + `nodeTypes` + `edgeTypes` + `hideOrphans` (spec: Goals).
- Exactly one default per graph, enforced by partial unique index `layouts_one_default_per_graph ON layouts (graph_id) WHERE is_default` (spec: Storage).
- Legacy promotion: migration sets `is_default = true, name = 'default-' || substr(id::text, 1, 8)` for rows `WHERE name = 'default'` (spec: Bootstrap).
- Default creation: composed retry — `TryCreate` → on not-created SELECT default → found: return (race lost); not found: next candidate name; ≤ 5 attempts then fail (spec: Builder check #1).
- `default` is reserved: `PUT …/visualizations/default` → 400 `ErrInvalidInput`; `GET …/visualizations/default` always resolves-or-creates (spec: Builder check #3).
- Autosave: 10 s interval, only when dirty; failed save keeps dirty and surfaces in notice; `beforeunload` best-effort `fetch(..., { keepalive: true })` (spec: Decisions, Builder check #4). Last-write-wins, no versioning.
- `archgen.py` updates MUST keep existing node ids stable (renames = label-only) — the user's saved default-visualization positions depend on ids (spec: Bootstrap #3).
- Backend integration tests: `cd backend && go test -tags=integration ./...` (needs Docker, it is up); unit: `make test`.
- Frontend: `cd frontend && npm test` / `npx tsc -b` / `npm run lint`; commit graph refresh via `make graph-refresh` at the end (CLAUDE.md).
- Commit style: conventional, English — `feat(be): …`, `feat(fe): …`, `docs(spec): …`, `chore: refresh code knowledge graph (…)`.

## Review Focus

1. Two tabs race to create the default → exactly one default row, both get it → integration test "second TryCreate returns the existing default" (Task 2).
2. Candidate name collides with a legacy non-default row → next candidate used, not a false "found" → service unit test with stub store (Task 3).
3. `PUT` with reserved name `default` → 400, no row written → httpapi test (Task 4).
4. Migration on a DB with a legacy `default` row → promoted, renamed `default-xxxxxxxx`, positions/viewport intact, `is_default` true → integration test running migrations against a pre-seeded old schema (Task 2).
5. Autosave PUT fails → dirty stays set → next tick retries; clean state never sends → GraphEditor test with fake timers (Task 6).

---

### Task 1: Commit docs; domain `Visualization`

**Files:**
- Modify: `backend/internal/domain/layout.go` → rename file to `backend/internal/domain/visualization.go` (`git mv`)
- Test: none for the type itself (covered via service/httpapi/storage tasks)

**Interfaces:**
- Produces (all later tasks consume): `domain.Visualization` struct — same fields as today's `Layout` plus `EdgeTypes *[]string` (`json:"edgeTypes,omitempty"`), `HideOrphans bool` (`json:"hideOrphans"`), `IsDefault bool` (`json:"isDefault"`); `Position`, `Viewport` unchanged. The old name `domain.Layout` disappears.

- [ ] **Step 1: Commit spec + plan docs**

```bash
git add docs/superpowers/specs/2026-11-06-visualization-design.md docs/superpowers/plans/2026-11-06-visualization.md
git commit -m "docs(spec): visualization entity design + plan"
```

- [ ] **Step 2: Rename and extend the domain type**

`git mv backend/internal/domain/layout.go backend/internal/domain/visualization.go`; rename `Layout` → `Visualization`, add the three fields with the exact JSON tags above.

- [ ] **Step 3: Verify the tree compiles except known followers**

Run: `cd backend && go build ./... 2>&1 | head -20`
Expected: compile errors ONLY in `service`, `httpapi`, `storage/postgres` (they still reference `domain.Layout`) — fixed by Tasks 2–4. Do not fix them here.

### Task 2: Migration `0004` + `VisualizationRepo`

**Files:**
- Create: `backend/internal/storage/postgres/migrations/0004_visualization_fields.up.sql` and `.down.sql`
- Modify: `backend/internal/storage/postgres/layouts.go` → rename file to `visualization.go` (`git mv`)
- Test: `backend/internal/storage/postgres/visualization_integration_test.go` (rename from `layouts_integration_test.go`, `git mv`, and extend)

**Interfaces:**
- Consumes: `domain.Visualization` (Task 1).
- Produces: `VisualizationRepo` with
  - `SaveVisualization(ctx, graphID, name string, positions map[string]domain.Position, vp domain.Viewport, nodeTypes, edgeTypes []string, hideOrphans bool) (domain.Visualization, error)` — upsert by `(graph_id, name)`, never flips `is_default` (`DO UPDATE SET positions=…, viewport=…, node_types=…, edge_types=…, hide_orphans=…`)
  - `GetVisualizationByName(ctx, graphID, name string) (domain.Visualization, error)` — `domain.ErrNotFound` when absent
  - `GetDefaultVisualization(ctx, graphID string) (domain.Visualization, error)` — `WHERE graph_id = $1 AND is_default`, `ErrNotFound` when none
  - `TryCreateDefaultVisualization(ctx, graphID, name string) (domain.Visualization, bool, error)` — `INSERT … (is_default = true) ON CONFLICT DO NOTHING RETURNING …`; when no row returned → `GetDefaultVisualization`; `created=false` + `ErrNotFound` means "name collided with a non-default row, try another name" (caller retries)

- [ ] **Step 1: Write the failing integration tests** (`//go:build integration`, rename the existing file's suites to the new names first, then add):

```go
func TestVisualizationRepo_NewFieldsRoundtrip(t *testing.T) {
	// save with edgeTypes []string{"rel"} + hideOrphans=true + nodeTypes nil;
	// GetVisualizationByName returns them; re-save with nil edgeTypes + false → NULL/false back
}

func TestVisualizationRepo_TryCreateDefault(t *testing.T) {
	// 1) created=true, IsDefault=true; 2) second TryCreate (any name) → created=false, SAME row (race lost)
	// 3) name collision with a legacy non-default row → created=false AND ErrNotFound (retry signal)
}

func TestVisualizationRepo_PromotionMigration(t *testing.T) {
	// startPostgres; apply versions 1..3 ONLY via a helper that mirrors RunMigrations but
	// calls m.Migrate(3) (golang-migrate iofs source, same embedded FS);
	// insert legacy row (name "default", positions {"n1":{1,2}}, graph via GraphRepo);
	// then RunMigrations(dsn) → applies version 4;
	// assert: row renamed to "default-" || substr(id::text,1,8), is_default=true,
	// positions intact; TryCreateDefaultVisualization now → created=false, same row;
	// then m.Migrate(2)-style down of version 4 (helper with m.MigrateDown or Steps(-1))
	// → columns gone (SELECT fails)
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/ -run 'Visualization' -v 2>&1 | tail -10`
Expected: FAIL — no `VisualizationRepo` / migration missing.

- [ ] **Step 3: Implement**

- `0004_visualization_fields.up.sql` exactly:

```sql
ALTER TABLE layouts
    ADD COLUMN edge_types   JSONB   NULL,
    ADD COLUMN hide_orphans BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN is_default   BOOLEAN NOT NULL DEFAULT false;
UPDATE layouts SET is_default = true,
                   name = 'default-' || substr(id::text, 1, 8)
 WHERE name = 'default';
CREATE UNIQUE INDEX layouts_one_default_per_graph
    ON layouts (graph_id) WHERE is_default;
```

  `.down.sql`: drop the index, then the three columns (promotion is not reversible — note in a comment).
- `visualization.go`: rename repo/methods per Interfaces; extend INSERT/SELECT/scan with the three columns (scan `edge_types` like `node_types`; `is_default` into `IsDefault`); `TryCreateDefaultVisualization` per Interfaces (conflict target: `ON CONFLICT DO NOTHING` without target catches both unique constraints).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test -tags=integration ./internal/storage/postgres/ -run 'Visualization' -v 2>&1 | tail -8`
Expected: PASS (renamed legacy suites + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/storage/postgres/
git commit -m "feat(be): migration 0004 + VisualizationRepo with lazy default creation"
```

### Task 3: `VisualizationService` + random names

**Files:**
- Create: `backend/internal/service/namegen.go`
- Modify: `backend/internal/service/layout.go` → rename to `visualization.go` (`git mv`)
- Test: `backend/internal/service/visualization_test.go` (rename from `layout_test.go`)

**Interfaces:**
- Consumes: `VisualizationRepo` methods (Task 2 signatures).
- Produces:
  - `VisualizationStore` interface = the four repo methods (Task 2)
  - `func NewVizName(rng *rand.Rand) string` — `adjective-animal-NN` from small fixed word lists (~20×20×100)
  - `VisualizationService` with `GetDefaultVisualization(ctx, graphID) (domain.Visualization, error)` (graph-exists check; loop ≤ 5 candidates: `TryCreateDefaultVisualization`; `created` → return; `!created && found` → return; `!created && ErrNotFound` → next name; exhausted → wrapped error), `GetVisualization(ctx, graphID, name)`, `SaveVisualization(ctx, graphID, name string, positions, vp, nodeTypes, edgeTypes []string…, hideOrphans bool)` — reserved name `default` → `ErrInvalidInput`; graph-exists check; nil positions → `map[...]Position{}`.

- [ ] **Step 1: Write failing unit tests** (stub store, real namegen):

```go
func TestNamegen_Format(t *testing.T)        // matches ^[a-z]+-[a-z]+-[0-9]{2}$, deterministic with seeded rand
func TestGetDefault_Creates(t *testing.T)    // stub returns created=true → returned, one Try call
func TestGetDefault_RaceLost(t *testing.T)   // first Try: created=false + default found → returned, no retry
func TestGetDefault_NameCollisionRetries(t *testing.T) // Try: created=false + ErrNotFound ×2, then created=true → 3 calls
func TestGetDefault_Exhausted(t *testing.T)  // ErrNotFound ×5 → error
func TestSave_ReservedName(t *testing.T)     // name "default" → ErrInvalidInput, store not called
```

- [ ] **Step 2: Run → FAIL** (`go test ./internal/service/ -run 'Namegen|Default|Reserved' -v`, missing symbols).
- [ ] **Step 3: Implement** `namegen.go` (two word slices + `rng.Intn`) and `visualization.go` per Interfaces (loop algorithm exactly as spec'd).
- [ ] **Step 4: Run → PASS**; also `go build ./...` (httpapi still broken — ok).
- [ ] **Step 5: Commit** — `feat(be): VisualizationService with lazy default and random readable names`.

### Task 4: HTTP API `/visualizations`

**Files:**
- Modify: `backend/internal/httpapi/layouts.go` → rename to `visualization.go` (`git mv`); `backend/internal/httpapi/router.go`; `backend/cmd/server/main.go`
- Test: `backend/internal/httpapi/visualization_test.go` (rename from `layouts_test.go`)

**Interfaces:**
- Produces (frontend Task 5 consumes): routes
  - `GET /graphs/{id}/visualizations/default` → 200 resolve-or-create
  - `GET /graphs/{id}/visualizations/{name}` → 200 | 404
  - `PUT /graphs/{id}/visualizations/{name}` → 201 upsert (body: positions, viewport, nodeTypes?, edgeTypes?, hideOrphans) | 400 reserved/invalid
  - old `/layouts` routes and `GET /graphs/{id}/layouts` list REMOVED
- `VisualizationAPI` interface mirrors the service methods.

- [ ] **Step 1: Write failing tests** (stub API, `routerWithVisualizations` helper replacing `routerWithLayouts`): default 200 (called with literal "default" path), get-by-name 200/404, PUT 201 + payload decode includes `edgeTypes`/`hideOrphans`, PUT name `default` → 400, old `/layouts` route → 404.
- [ ] **Step 2: Run → FAIL** (`go test ./internal/httpapi/ -run Visualization -v`).
- [ ] **Step 3: Implement**: rename handlers (`handleGetDefaultVisualization`, `handleGetVisualization`, `handleSaveVisualization` reading `chi.URLParam "name"`; reserved check `name == "default"` → `ErrInvalidInput`), router `r.Route("/graphs", …)` block gains the three routes via `r.Route("/{id}/visualizations", …)` with `r.Get("/default", …)` BEFORE `r.Get("/{name}", …)`; `main.go` wires `VisualizationService`; delete `listLayouts` usage.
- [ ] **Step 4: Run → PASS**; `cd backend && go build ./... && go vet ./...` clean; `make test` green.
- [ ] **Step 5: Commit** — `feat(be): /visualizations routes replace /layouts`.

### Task 5: Frontend API client + types

**Files:**
- Modify: `frontend/src/api/types.ts`, `frontend/src/api/client.ts` (+ its test if present)
- Test: `frontend/src/api/client.test.ts` (create if absent — follow existing request-mock pattern from the suite)

**Interfaces:**
- Produces (Task 6 consumes):
  - `interface Visualization` = current `Layout` fields + `edgeTypes?: string[] | null`, `hideOrphans: boolean`, `isDefault?: boolean` (drop `Layout`)
  - client: `getVisualization: (id, name) => request<Visualization>(GET …/visualizations/${name})`, `getDefaultVisualization: (id) => request<Visualization>(GET …/visualizations/default)`, `saveVisualization: (id, name, positions, viewport, nodeTypes?, edgeTypes?, hideOrphans) => request<Visualization>(PUT …/visualizations/${name}, body)` — remove `listLayouts/saveLayout/getLayout`.

- [ ] **Step 1: Failing tests**: GET default URL path; PUT payload carries `edgeTypes`/`hideOrphans` and omits undefined filters; encoded name.
- [ ] **Step 2: Run → FAIL** (`npx vitest run src/api/`).
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run → PASS** (GraphEditor still references old client methods — fixed in Task 6; run only `src/api/`).
- [ ] **Step 5: Commit** — `feat(fe): visualization client methods`.

### Task 6: GraphEditor — load by URL/default, viewport tracking, autosave, drop LayoutBar

**Files:**
- Modify: `frontend/src/graph/GraphEditor.tsx`, `frontend/src/graph/GraphCanvas.tsx` (+ its test), `frontend/src/App.tsx`
- Delete: `frontend/src/graph/LayoutBar.tsx`, `frontend/src/graph/LayoutBar.test.tsx`
- Test: `frontend/src/graph/GraphEditor.test.tsx`

**Interfaces:**
- Consumes: client methods (Task 5); existing `useGraph` (filters + `reload(positions)`).
- Produces: `GraphEditorProps` gains `initialVizName?: string`; `GraphCanvasProps` gains `applyViewport?: Viewport` (applied once via ReactFlow `onInit` → `instance.setViewport`, before user interaction) and `onMove?: (vp: Viewport) => void`; `fitView` stays but GraphEditor renders it only when the loaded viz had empty positions.

- [ ] **Step 1: Write failing tests** (fake timers `vi.useFakeTimers()` for autosave):

```tsx
it('loads the default visualization and applies its filters and positions', /* getDefaultVisualization resolved with
   nodeTypes ['Task'], edgeTypes null, hideOrphans true, positions {n1:{x:5,y:5}} → type-Milestone unchecked,
   hide-orphans pressed, n1 at 5,5; badge shows viz name */)
it('falls back to default when ?viz= name is unknown', /* getVisualization rejects → default used; no crash */)
it('autosaves dirty state every 10s and not when clean', /* move node (onNodesChange position) → advance 10s →
   PUT called once with full payload incl. filters; advance 10s again without changes → still one call */)
it('failed autosave keeps dirty and retries next tick', /* saveVisualization rejects → advance 10s → called again */)
it('wires viz name into the URL once resolved', /* history.replaceState spy: ?graph=g1&viz=<name> */)
```

Mount-test updates: LayoutBar gone (`queryByText('Save layout')` null), badge with viz name present, `graph-canvas` present.

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/graph/GraphEditor.test.tsx`).
- [ ] **Step 3: Implement** in `GraphEditor.tsx`:
  - state `vizName: string | null`; mount effect: resolve (`initialVizName` via `getVisualization` with `.catch(() => null)` ?? `getDefaultVisualization`) → set name, `history.replaceState` to add `&viz=` if absent, apply filters + `reload(viz.positions)`, store `viz.viewport` for `applyViewport`;
  - `dirty = useRef(false)`; mark dirty: wrap `onNodesChange` (position-type changes), the three filter setters, and `onMove`;
  - autosave `useEffect`: `setInterval(save, 10_000)` where `save = () => { if (!dirty.current || !vizName) return; saveVisualization(...extractPositions(allNodes), viewport, visibleTypes?.size ? [...visibleTypes] : undefined, …) .then(() => dirty.current = false) .catch(() => setNotice('autosave failed — retrying')) }`;
  - `beforeunload` listener (registered in the same effect): if dirty → same PUT with `{ keepalive: true }`;
  - `App.tsx`: read `viz` param, pass `initialVizName`, keep the existing `?graph=` rewrite;
  - `GraphCanvas.tsx`: new optional props per Interfaces (`onInit` chain: if `applyViewport` set → `instance.setViewport(applyViewport)`; forward `onMove`).
- [ ] **Step 4: Run → PASS**; `npm test` whole suite green (LayoutBar suites deleted; GraphEditor suite updated).
- [ ] **Step 5: Commit** — `feat(fe): visualizations — URL, autosave, viewport; LayoutBar removed`.

### Task 7: Self-description (`archgen.py`) with stable ids

**Files:**
- Modify: `scripts/archgen.py`
- Regenerate: `seed/aeig-arch-graph.{sql,cypher}`

**Interfaces:**
- Consumes: nothing new.
- Produces: updated data-layer graph — ids of existing nodes UNCHANGED (e.g. `ent-layout` keeps its id, label → `Visualization`); new nodes only: `fld-layouts-edge-types`, `fld-layouts-hide-orphans`, `fld-layouts-is-default` (`has_field` from `tbl-layouts`), `ent-edgetypes`, `ent-hideorphans` (`part_of` → `ent-layout`, `serializes` → the new fields); notes mention the partial unique index.

- [ ] **Step 1: Update the model** in `archgen.py` per Interfaces (label rename `Layout`→`Visualization` on `ent-layout`; add the nodes/edges above; extend `fld-layouts-name` note with "default зарезервировано").
- [ ] **Step 2: Regenerate + apply** — `make arch-regen` (DBs are up; prints counts). Verify old ids kept positions: `docker compose exec -T neo4j cypher-shell … "MATCH (x:Element {graphId:'c0de0000-0000-4000-8000-000000000003'}) RETURN count(x)"` grew by exactly 5; the promoted default row in `layouts` still holds 35+ old ids (positions untouched by seed).
- [ ] **Step 3: Commit** — `feat: self-description — visualization fields (stable ids)`.

### Task 8: Apply migration to the dev DB + full verification + graph refresh

**Files:** none new (verification + generated graphify-out).

- [ ] **Step 1: Backend suites** — `cd backend && make test && go test -tags=integration ./...` → green.
- [ ] **Step 2: Frontend** — `cd frontend && npm test && npm run lint && npm run build` → green.
- [ ] **Step 3: Apply migration to the running dev DB** (server binary is old — do not restart it, user will):

```bash
docker compose exec -T -e PGPASSWORD=devpass postgres psql -q -U aeig -d aeig \
  < backend/internal/storage/postgres/migrations/0004_visualization_fields.up.sql
docker compose exec -T -e PGPASSWORD=devpass postgres psql -t -U aeig -d aeig \
  -c "SELECT name, is_default FROM layouts WHERE graph_id='c0de0000-0000-4000-8000-000000000003';"
```

Expected: one row `default-xxxxxxxx | t` (the user's saved arrangement promoted).

- [ ] **Step 4: `make graph-refresh` + commit** — `chore: refresh code knowledge graph (visualizations)`.
- [ ] **Step 5: Report** — tell the user to restart `make dev` (backend migrates + serves new routes) and open `http://localhost:5173/?graph=c0de0000-0000-4000-8000-000000000003`: the promoted default opens with their arrangement; moving a node persists within ~10 s.
