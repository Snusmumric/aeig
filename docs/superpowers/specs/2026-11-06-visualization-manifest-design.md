# Visualization manifest: save-as button, staleness diff, sync, default named "default" — Design

Date: 2026-11-06
Status: draft (brainstorm 2026-11-06)

## Context

Today a visualization stores positions (bare `{nodeId: {x, y}}` hints), viewport, and
filters. Its element set is **implicit**: whatever the graph currently has, filtered by
viz filters, with coordinate hints applied by id. Consequences the user confirmed by
inspection: deleted nodes leave invisible dead keys (nothing to render a ghost from),
new nodes silently get grid slots, edges are stored not at all (only the type filter),
and the viz cannot know it is stale. This feature makes the element set **explicit and
remembered** (a light manifest), adds a save-as button, renames the default to the
literal `default`, and adds soft binding to the graph version with a diff/sync UX.

## Intent and why

A visualization should open "as it was saved" against a graph that may have moved on:
show what disappeared (ghosts), show what appeared (highlighted additions, opt-in),
and let the user sync — permanently adopting the current graph into the viz.
Plus first-class creating/saving visualizations under names, with the default one
created on first open under the predictable name `default`.

## Goals

1. **Save button** «Сохранить визуализацию»: inline mini-form in the toolbar
   (input prefilled with the current viz name + ОК/Отмена).
   - Name ≠ current, name free → save-as fork: current on-screen state saved under the
     new name, current viz switches to it (URL `?viz=` rewritten), autosave retargets.
   - Name exists (same graph) → native `confirm()` «Перезаписать?» → PUT on confirm,
     cancel does nothing.
   - Name = current name → plain save of the current on-screen state.
   - Empty/blank name rejected client-side (server already 400s).
   - **All saves carry the binding as-is** (manifest/graphVersion are copied, never
     refreshed) — "what you see is what you save"; a fork can conserve a stale picture
     under a new name. The ONLY act that adopts the current graph is «Синхронизировать».
2. **Default named `default`**, created on first open (`GET …/visualizations/default`
   resolve-or-create keeps its semantics; created row gets `name = "default"`).
3. **Soft binding**: viz stores `graph_version` of the graph at the moment of its last
   explicit save/sync. On open, `viz.graphVersion < graph.version` → staleness UI.
4. **Manifest** (the element memory):
   - `nodes: {id → {type, label, x, y}}`, `edges: {id → {type, source, target}}`;
   - diff vs the current subgraph gives: deleted (in manifest, not in graph — renderable
     ghosts), added (in graph, not in manifest — highlighted additions).
5. **Diff UX** (only when a diff exists): staleness bar
   «Граф изменилось: −N узлов/рёбер, +M» with three controls:
   - toggle «Удалённое» (ghosts), toggle «Новое» (additions) — **both ON by default**:
     everything shows immediately, highlighted (the reader instantly sees the drift);
     the toggles hide the respective layers;
   - ghosts: semi-transparent (`opacity .45`) + dashed red-gray outline, not
     draggable/deletable, drawn from manifest, bypass type filters;
   - additions: current nodes/edges with a green dashed outline/glow; added edges are
     animated (ReactFlow `animated`) green `#22c55e`; additions respect type filters;
   - button «Синхронизировать»: PUT with manifests := current subgraph,
     `graphVersion := current`, positions := current on-screen positions of alive nodes
     (additions never shown → grid slots); dead ids pruned from the DB row for good.
6. **Acceptance demo**: graph `…0003` default viz (35 positions, graph now has 40
   nodes) — on open: «5 появилось», toggle reveals the 5 highlighted (grid),
   sync adopts them; row becomes v-current, manifests filled.

## Non-goals

- Element properties in the manifest (label/type/geometry only), graph history,
  version restore/undo, ghost editing (ghosts are read-only).
- Renaming/deleting visualizations; a viz list UI (URL `?viz=` remains the access path).
- Changing optimistic concurrency of graph mutations.

## Reversed earlier decisions (supersede the 2026-11-06 visualization spec)

- `default` is **no longer reserved**: `PUT …/visualizations/default` is legal — it is
  the default's own name (autosave of the default writes under it).
- The random name generator (`adjective-animal-NN`) is removed with this feature
  (nothing generates random names anymore).
- Migration `0004`'s promotion renamed defaults to `default-<uuid8>`; migration `0005`
  renames `is_default` rows back to `default` (safe: no `default`-named rows exist
  post-0004).

## Decisions (how it gets built)

### Storage — migration `0005_visualization_manifest`

```sql
ALTER TABLE layouts
    ADD COLUMN graph_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN nodes         JSONB NULL,   -- manifest nodes, NULL = legacy (pre-manifest viz)
    ADD COLUMN edges         JSONB NULL;   -- manifest edges, NULL = legacy
UPDATE layouts SET name = 'default' WHERE is_default;
```

`.down.sql` drops the three columns (rename back is not reconstructed — noted in file).

### Backend

- `domain.Visualization` += `GraphVersion int64`, `Nodes *map[string]ManifestNode`
  (`{Type, Label string; X, Y float64}`), `Edges *map[string]ManifestEdge`
  (`{Type, Source, Target string}`) with json tags `graphVersion` / `nodes` / `edges`.
- PUT body accepts and returns the three fields; GET-by-name/default return them.
- `TryCreateDefaultVisualization` creates with name `"default"`, `GraphVersion = 0`,
  manifests NULL (binding is established by the frontend's first explicit sync —
  keep element knowledge client-side; no ElementStore dependency in VisualizationService).
- **Self-healing `default`**: any INSERT of a row named `default` sets
  `is_default = true` (both TryCreate and the PUT upsert insert path). A non-default row
  named `default` therefore cannot exist; the 5-candidate retry loop and the
  `adjective-animal-NN` generator are deleted. `GetDefaultVisualization` =
  SELECT by `is_default` → INSERT (name `default`, `is_default`) → on unique conflict,
  SELECT again (race lost) → still nothing: 500.
- Reserved-name check deleted everywhere.
- `SaveVisualization` validation unchanged otherwise (blank → 400).
- Manifests are opaque JSONB to the backend (no semantics) — validation: decode errors
  → 400; size guard: reject bodies > 1 MB (positions+manifests grow with graph size).
- PUT treats `graphVersion`/`nodes`/`edges` as partial fields: absent → unchanged,
  present → set (this is what lets autosave preserve the binding while sync refreshes it).

### Frontend

- **Load**: after resolving viz + subgraph, branch by binding state:
  1. **Unbound** (manifests NULL AND positions empty/absent — e.g. a freshly created
     default): no bar, nothing hidden, everything visible as today. The informational
     version badge is never shown for unbound rows (`graphVersion = 0`).
  2. **Legacy** (manifests NULL AND positions non-empty): synthesize — manifest nodes :=
     current nodes having a **saved position entry** (adopted, with their type/label);
     position keys without a live node → ghost entries `{type: "ghost", label: id}`;
     manifest edges := current edges (legacy rows never tracked edges — deleted edges
     untrackable for them). Diff as normal. Graph `…0003` lands here: 35 saved →
     «5 появилось».
  3. **Bound** (manifests present): plain diff. Informational badge «v→v'» only when
     `graphVersion > 0`, diff empty, and version moved (property-only changes).
- `deleted = manifest − graph`, `added = graph − manifest`; counts drive the bar.
- **Autosave keeps the binding**: the 10 s PUT sends positions/viewport/filters only.
  The Save button (fork/plain/overwrite) also carries the binding as-is.
  **Only Синхронизировать refreshes it**: manifest := current subgraph,
  `graphVersion := current`.
- **Rendering layers**: `useGraph` stays graph+filters; GraphEditor holds
  `showDeleted` / `showAdded` toggles (**both true by default**, i.e. the toggles hide)
  and derives display arrays: visible nodes = filtered graph nodes plus additions
  (highlighted) when `showAdded`, plus ghost nodes when `showDeleted`;
  edges likewise; ghosts/added edges dashed, ghost edges may connect ghost↔alive nodes.
- **Save-as form**: appears in place of the badge on button click; ОК flow per Goals 1;
  after any successful save under a different name the current viz name updates and
  `history.replaceState` fixes `?viz=` (the binding travels unchanged).
- **GraphEditor props**: unchanged externally (`initialVizName` already exists).

### archgen (self-description, same change)

`layouts` gains `graph_version`, `nodes`, `edges` fields; `fld-layouts-name` note:
"default — имя дефолтной визуализации"; entity `Visualization` gains part_of members
`ManifestNodes` / `ManifestEdges` + `serializes` edges; ids stable (label-only edits,
new nodes/edges appended at the end). `make arch-regen` after implementation.

## Edge cases

- Stale but empty diff (version bumped by property-only changes): informational badge
  «v→v'», no toggles, sync still available (refreshes binding).
- Addition of a filtered-out type: visible only with «Новое» AND its type filter on.
- Sync with both toggles off: additions adopted at grid slots (per Goals 5).
- Ghost endpoints: ghost edge between two ghosts / ghost+alive draws normally.
- Two tabs: last-write-wins as before (no new conflict machinery).
- Legacy viz (NULL manifests) never reports deleted edges (they were never tracked).

## Testing

- Backend: migration 0005 up/down (+ default rename incl. the `default-8e1c94d1` case),
  manifest round-trip incl. NULL vs empty map, 1 MB guard, reserved-name check gone
  (PUT `default` 201, self-healing `is_default` on fresh insert of name `default`),
  create-default named `default`, retry loop/namegen removed (GET default on
  default-less graph creates it; concurrent race resolves to one row).
- Frontend: save-as flow (fork/switch/URL, binding carried as-is), conflict confirm path,
  plain-save preserves binding, autosave payload does NOT include manifest fields,
  sync PUT payload refreshes binding (manifest := subgraph, pruned positions), legacy
  synthesis diff, unbound-viz no-bar rule, toggles render ghost/added layers
  (shown+highlighted by default, toggles hide), acceptance scenario on the `…0003` fixture (35 vs 40).
- Existing suites stay green (reserved-name tests updated/removed).

## What's left to the builder (plan level)

- Exact component decomposition of the diff layer inside GraphEditor;
  ghost/added node/edge styling values; the staleness bar markup; test file layout;
  migration numbering check; whether `saveArgs` splits into autosave/explicit variants
  in one helper.
