# Graph Visualization entity (evolution of layouts) — Design

Date: 2026-11-06
Status: draft (brainstorm 2026-11-06)

## Context

The editor persists manual "layouts" (positions + viewport + visible node types) behind a
manual Save/Load UI (`LayoutBar`). The product now needs a first-class **visualization**:
a shareable page showing a subset (or all) of a graph's nodes/edges, with their arrangement,
identified by URL and autosaved. Decision: **evolve `layouts` into visualizations** — one
entity, one mechanism — instead of adding a parallel one.

## Intent and why

A visualization is "your current view of the graph": which elements are visible (filters),
where they sit (positions), and the viewport. It should survive reloads (DB), sync itself
(autosave every 10 s), and be shareable (`?graph=<id>&viz=<name>`).

## Goals

- Per-graph visualizations persisted in PostgreSQL (the `layouts` table, extended).
- Exactly one **default** visualization per graph, lazily created on first open with a
  backend-generated random readable name (`adjective-noun-NN`, e.g. `quiet-harbor-42`).
- URL contract: `?graph=<id>&viz=<name>`; opening a graph without `viz` resolves/creates the
  default and writes `viz` into the URL.
- Autosave every 10 s when state changed since the last save; best-effort save on tab close.
- Visualization state = positions + viewport + nodeTypes + **edgeTypes + hideOrphans**
  (the last two replace the earlier "session-only" decision — they are part of the subset now).
- The self-describing data-layer graph (`scripts/archgen.py`) is updated in the same change.

## Non-goals (this iteration)

- UI for creating, listing, or switching visualizations (beyond `?viz=`).
- Deletion of visualizations; renaming.
- Conflict resolution / versioning of visualizations — **last-write-wins**.
- Migrating old manual layout rows into anything (they survive as data; the UI that read
  them goes away).

## Anti-goals

- A second persistence mechanism parallel to visualizations.
- Returning of the manual Save/Load UI.

## Constraints

- Full stack: migration + backend (domain/service/httpapi/storage) + frontend + seeds.
- Backend integration tests (testcontainers, `make test-integration`) must pass; migration
  has a working `.down.sql`.
- Repo conventions: TDD, conventional commits, `make graph-refresh` before done.

## Approaches (from brainstorm)

1. **Evolve with full concept rename, keep table name** — migration extends `layouts`;
   code renames Layout→Visualization everywhere; REST becomes `/visualizations`. ✅ picked
   (one concept, one name in code/API/URL; zero data migration).
2. Also rename the table (`visualizations`) — same plus a data migration for aesthetics.
   Rejected: migration risk with no functional gain.
3. Keep the `layouts` naming and only add fields — rejected: three names for one entity
   (URL says `viz`, UI says «визуализация», API says layouts).

## Decisions (how it gets built)

### Storage (migration `0004_visualization_fields`)

```sql
ALTER TABLE layouts
  ADD COLUMN edge_types  JSONB   NULL,          -- NULL = no filter (all visible)
  ADD COLUMN hide_orphans BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_default  BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX layouts_one_default_per_graph
  ON layouts (graph_id) WHERE is_default;       -- exactly one default per graph
```

The table keeps its name (documented in the migration header as the visualization store).

### Backend concept rename

`domain.Layout` → `domain.Visualization` (+ `EdgeTypes *[]string`, `HideOrphans bool`,
`IsDefault bool`), `LayoutService` → `VisualizationService`, repo methods renamed;
REST: `GET /graphs/{id}/visualizations/{name}`, `PUT /graphs/{id}/visualizations/{name}`
(upsert full state; never flips `is_default`), `GET /graphs/{id}/visualizations/default`
(returns the default; **creates** it if missing — empty positions, identity viewport,
null filters; random name with retry-on-collision). Old `/layouts` routes and the list
endpoint are removed (single client, no compat needed).

### Frontend

- `App.tsx`: parse `graph` + `viz`; pass both down; `history.replaceState` adds `&viz=…`
  once the default resolves.
- `GraphEditor`:
  - mount: load viz by name from URL, or `default` (auto-created); apply filters to
    `useGraph` (`setVisibleTypes/setVisibleEdgeTypes/setHideOrphans`) + positions;
    unknown `viz` name → fall back to default + rewrite URL.
  - viewport: tracked via ReactFlow `onMove` (fixes today's hardcoded `{0,0,1}`); applied
    from the loaded viz after init (`fitView` only for a fresh empty visualization).
  - autosave: `setInterval` 10 s; saves only when dirty (any node position change, filter
    change, viewport change since last save) via `PUT`; best-effort `fetch(..., {keepalive:true})`
    on `beforeunload`.
  - `LayoutBar` removed; a small badge shows the current visualization name.
- `useGraph` itself is unchanged except what already exists (filters are now set from the
  loaded viz and saved with it).

### Seeds / self-description

`scripts/archgen.py`: `layouts` table gains `edge_types`, `hide_orphans`, `is_default`
(+ unique-index note); `Layout` entity renamed `Visualization` (+ new part_of members
`EdgeTypes`, `HideOrphans` with `serializes` edges); regenerate + `make arch-regen`.

### Concurrency and edge cases

- Two tabs first-open race: both try to create the default → unique partial index; the
  loser retries as read (treat 23505 as "already exists", SELECT it).
- Autosave conflicts: last-write-wins (whole-state PUT).
- Old manual layout rows: untouched data, no UI (accepted).
- Random name: adjective+animal+2-digit number from fixed word lists (~enough entropy for
  per-graph uniqueness, retried on collision anyway).

## Testing

- Backend unit: service (lazy default create incl. race fallback), httpapi (routes, PUT
  payload decode incl. new fields, default auto-create 200), storage integration
  (migration up/down, partial unique index behavior, roundtrip of new fields).
- Frontend: client methods (`getVisualization`, `saveVisualization`, `getDefaultVisualization`);
  GraphEditor with fake timers — dirty → 10 s → PUT with full payload; clean → no call;
  filters restored from viz; `?viz=` handling; LayoutBar removal reflected in suite.
- `archgen` output regenerated and applied (data-layer graph stays SSOT).

## Builder check outcomes (settled calls)

1. **23505 retry algorithm (composed)**: on unique-violation while creating the default →
   `SELECT … WHERE graph_id = $1 AND is_default` → if found, return it (race lost); else
   regenerate the random name and retry INSERT. Bound: 5 attempts → 500. No constraint-name
   disambiguation needed — the composed algorithm handles both collision sources (lost race,
   name collision incl. legacy rows). Tests must cover both sources separately.
2. **Legacy rows are reachable visualizations**: concept evolution means any `layouts` row is
   a visualization; `?viz=<old-manual-name>` loads it and autosave writes into it — old
   saved layouts keep working via links. Accepted corollary: a legacy row literally named
   `default` is shadowed by the reserved route and unreachable (manual-save artifact).
3. **`default` is a reserved name**: `GET /graphs/{id}/visualizations/default` always means
   resolve-or-create-the-default; `PUT …/{name}` with `name = "default"` → 400 reserved.
4. **Failed autosave keeps the dirty flag**: retried on the next 10 s tick; failure surfaced
   in the existing error/notice area; `beforeunload` still attempts a last save.

## Bootstrap of the default visualization (added condition, 2026-11-06)

The user's current in-browser arrangement of the architecture graph
(`c0de0000-0000-4000-8000-000000000003`) becomes its default visualization:

1. The user saves it NOW via the still-existing manual UI (Save layout, name `default`).
2. **Migration 0004 promotes legacy defaults**: `UPDATE layouts SET is_default = true,
   name = 'default-' || substr(id::text, 1, 8) WHERE name = 'default';` — every graph's
   manual `default` save becomes its default visualization under a unique name (keeps the
   reserved literal clean; the URL gets the promoted name on first open).
3. **Graph-change semantics** (the architecture graph will be reseeded during this very
   task): positions are keyed by node **id** — untouched nodes keep their places; a renamed
   node keeps its position iff `archgen.py` changes only the `label` and keeps the id
   stable (committed rule for archgen updates); brand-new nodes fall back to the grid;
   deleted nodes/edges vanish, and their stale position entries are pruned by the first
   autosave (`extractPositions` snapshots the current `allNodes` only).

## What's left to the builder (plan level)

- Exact test file layout and step order; ReactFlow viewport application details
  (`onInit` + `setViewport`); `beforeunload` handler wiring; word lists for the name
  generator; whether `getDefaultVisualization` lives as one call in the client.
