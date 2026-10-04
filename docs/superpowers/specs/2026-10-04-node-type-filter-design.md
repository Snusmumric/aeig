# Node-type filter (canvas) — Design

Date: 2026-10-04
Status: approved (brainstorm 2026-10-04)

## Context

Phase-1 editor renders the whole subgraph. For the code graph (285+ elements) and the
roadmap graph a user wants to focus on a subset of node types (e.g. only `service` +
`httpapi`). Roadmap Phase 2 plans server-side "subgraph projection by metamodel";
this feature is the client-side slice of that UX, delivered now.

## Decisions (from brainstorm)

- **Filtering happens on the client.** Server-side projection stays in Phase 2; when
  it lands, the same UI can drive a `types` query param.
- **The selection persists in saved layouts** (alongside positions + viewport).
- **UI: an always-visible checkbox panel** in the toolbar (not a dropdown, not chips).

## UI

`TypeFilterPanel` — toolbar section to the right of `LayoutBar`:

- one checkbox per node type present in the **full** subgraph (unique types of
  `sg.nodes`, alphabetical), with a color swatch from `TypeStyleMap`
- «Все» / «Ни одного» buttons
- default state: everything checked (filter inactive)

## State & semantics

- `useGraph` keeps the full subgraph and exposes:
  - `types: string[]` — all node types of the current subgraph
  - `visibleTypes: Set<string> | null` — `null` means "no filtering" (all visible)
  - `nodes` / `edges` — **already filtered** (derived via `useMemo`)
- `filterSubgraph(sg, visibleTypes | null): Subgraph` — pure function:
  - `null` → returns `sg` unchanged
  - else keeps nodes whose `type` is in the set; keeps an edge only when **both**
    endpoints are kept
  - empty set is allowed (empty canvas)
- Creating a node of a type missing from an active set (the «Add Task» path)
  auto-adds the type to `visibleTypes`, so a freshly created node is never invisible.

## Persistence (layout)

- Migration `0003_layout_node_types.up.sql`:
  `ALTER TABLE layouts ADD COLUMN node_types JSONB NULL;`
  (down: drop the column). `NULL` = no filter stored — old layouts keep working and
  mean "all types".
- `domain.Layout.NodeTypes *[]string` with `json:"nodeTypes,omitempty"` (`nil` = all).
- REST: `nodeTypes` is an optional field of the save-layout request and appears in
  layout responses when set. No endpoint changes.
- Save: active filter → `nodeTypes: [...]`; inactive → field omitted.
- Load: apply `positions` and, when present, `nodeTypes` (replaces the current set;
  absent → `null`).

## Edge cases

- Empty visible set saved explicitly as `[]` → on load the canvas is empty; allowed,
  no special-casing.
- Types that disappear from the subgraph simply vanish from the checkbox list; the
  set may contain stale entries — they are pruned on the next toggle (the panel
  normalizes against the current subgraph's types), so they cannot skew the
  "all checked → null" normalization.
- 409-conflict reload flow (`commitMutation`) is unaffected: reload refetches the
  full subgraph and re-applies the current set.

## Out of scope

- Server-side projection (`GET /graphs/{id}/subgraph?types=…`) — Phase 2.
- Edge-type filtering, focus/depth, metamodel definitions — Phase 2.

## Testing

- `filterSubgraph.test.ts`: null passthrough; type subset; edge dropped when either
  endpoint hidden; empty set.
- `TypeFilterPanel.test.tsx`: renders one checkbox per type with swatch; toggling
  fires callback; «Все»/«Ни одного».
- `useGraph.test.tsx`: derived nodes/edges respect the set; new types appear in `types`.
- `GraphEditor.test.tsx`: save sends `nodeTypes` when filter active; load applies them.
- `api/client.test.ts`: `nodeTypes` in save payload / typed response.
- Backend: unit (JSON decode of optional field, nil round-trip) + integration
  (save & read a layout with `nodeTypes`; migration up/down on testcontainer).
