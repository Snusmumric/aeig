# Slices (срезы) — named node sets, PG identity + membership property — Design (v3.1)

Date: 2026-11-21
Status: draft (brainstorm 2026-11-08..21; three storage designs considered — see Approaches;
UI and description/rename requirements added 2026-11-21)

## Context

A slice is a named, arbitrary set of nodes of a graph — a way to carve the graph into
named regions ("срез") and operate on them. An edge belongs to a slice iff both its
endpoints do (derived, never stored anywhere). Storage design went through three
variants; v3 (user's refinement) is final: slice **identity and metadata live in
Postgres** (like the graph entity itself), **membership is a system property on
elements** in Neo4j, and the Neo4j store contains no auxiliary structures. This
revision (v3.1) adds a user-editable `description` and defines the full UI: a slice
management menu on the graph page (create/rename/delete) and node membership via a
right-click context menu.

## Intent and why

Slices are named selections over graph elements. Identity, naming, description and
lifecycle belong to the metadata store (Postgres — the established principle: `graphs`
itself lives exactly this way); membership is an annotation on the element it
describes, kept in the same store as the element. The Neo4j graph remains a pure bag
of user elements: no extra labels, no extra relationship types, no helper nodes —
what `GET /subgraph` projects is exactly what the user's graph is.

## Goals

1. Slice = named node set **with a free-text description**, scoped per graph (same
   name on different graphs = different slices). Edge membership is derived: both
   endpoints carry the slice id.
2. Operations, all available from the UI:
   - create a slice (name + description),
   - list slices of a graph (with member counts and descriptions),
   - rename a slice (and edit its description),
   - delete a slice,
   - get slice members (hydrated full node data),
   - add/remove a node to/from a slice — via the node's context menu,
   - add an edge to a slice (= add both endpoints) — via the edge's context menu,
   - view: the active slice marks its members and can dim/hide non-members
     («Только срез»).
   - **filter by slices**: show/hide named slices (checkbox per slice, default all
     visible). The filter state is **part of the visualization** and persists with it
     (autosave), like the type filters.
3. UI (two surfaces):
   - **Slice menu** on the graph page (toolbar button «Срезы» opens a panel): the
     slice list (name, description, member count), create form (name + description),
     rename/description editing (inline), delete (with confirm).
   - **Context menu** on right-click of a node (ReactFlow `onNodeContextMenu`): the
     list of the graph's slices with a checkmark for the node's current memberships;
     clicking toggles membership; a «новый срез…» row creates one and adds the node.
   - **Context menu** on right-click of an edge (`onEdgeContextMenu`): the same slice
     list, minus checkmarks; clicking adds BOTH endpoints to the slice (the derived
     edge membership). Removing an edge from a slice is not offered (derived — remove
     an endpoint instead).

## Storage

### Postgres — migration `0007_slices`

```sql
CREATE TABLE slices (
    id          UUID PRIMARY KEY,
    graph_id    UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (graph_id, name)
);
```

`ON DELETE CASCADE` from graphs mirrors `layouts`. No `created_at` — deliberately
omitted (YAGLI decision, user-picked): no consumer exists; adding it later is a
one-minute migration. Description is arbitrary user text (multi-line allowed; the
existing 1 MB request cap bounds it).

### Neo4j — system property `sliceIds` on `:Element`

```
(:Element {graphId, id, type, sliceIds: [uuid, uuid, …]})
```

- `sliceIds` becomes the **fourth system property** (after `graphId`, `id`, `type`):
  added to `reservedKeys` in the neo4j store and stripped by `userProps` on read, so
  slice ids never leak into API responses as user properties.
- **UpsertNode must preserve memberships**: today `UpsertNode` is
  `MERGE … SET x = $props` — a full property replacement, and `buildProps` drops
  reserved keys, so a naive change would wipe `sliceIds` on every element edit. The
  upsert query captures the current `sliceIds` before the replacement and restores it
  after (WITH-capture pattern in one query). Existing API semantics of the mutation
  path are unchanged (omitted user properties are still deleted); only the system
  property survives. `UpsertEdge`/`DeleteNode` need no changes (edges never touch node
  properties; node deletion removes memberships with the node).
- All membership operations are **single-statement Cypher expression updates** per node
  (they serialize on the node's write lock — no read-modify-write races):
  - add: `SET e.sliceIds = coalesce(e.sliceIds, []) + $sid`
  - remove: `SET e.sliceIds = [x IN coalesce(e.sliceIds, []) WHERE x <> $sid]`
- Adding: unknown element ids are skipped (idempotent-friendly); the API returns the
  current member count.
- Members of a slice: `MATCH (e:Element {graphId: $g}) WHERE $sid IN e.sliceIds RETURN e`.

### Membership is exposed to the client

Filtering, member markers and context-menu checkmarks all need per-node membership, so
`GET /subgraph` returns it as a **typed field**: `GraphNode.sliceIds?: string[]`
(`domain.GraphNode.SliceIDs []string \`json:"sliceIds,omitempty"\``, populated in
GetSubgraph explicitly). This does NOT relax the reserved-property rule: `sliceIds` is
still stripped from user properties (`userProps`) — it is surfaced as a system field
of the response shape, never as a user property.

### Lifecycle rules

- **Delete slice** = PG row delete + best-effort synchronous Neo4j sweep of the sid
  from all elements of the graph (one Cypher statement) — a sweep failure still
  returns 204; leftovers are inert garbage, never rendered (slices list comes from PG).
  No retry/background mechanism in this change.
- **Rename / edit description** = PG only (the slice UUID is stable — nothing in
  Neo4j references the name).
- Slice edits do **not** bump `graphs.version` (annotations; per-op idempotency
  replaces versioning).

### Slice filter — visualization state (migration `0008_layout_visible_slices`)

- `layouts` gains `visible_slices JSONB NULL` — array of **visible** slice UUIDs;
  `NULL` = no filtering (default: all slices visible). Same wire mechanism as the
  other viz fields: partial-PUT (absent = unchanged, present = full replace), written
  by **autosave** (layout-family, like positions/bends — unlike the manifest binding).
- Frontend state: `visibleSlices: Set<sliceId> | null` in `useGraph`, mirroring
  `visibleTypes`/`visibleEdgeTypes` (null = all; the panel normalizes «все отмечены»
  → null; «Ни одного» → empty set). Persisted via autosave; restored on viz load.
- **Filtering semantics** (in `filterFlow`, composing with type filters AND-style):
  a node is hidden iff **any** of its `sliceIds` is in the hidden set. Nodes with no
  slice membership are always visible. Edges follow their endpoints (both visible),
  exactly like the type-filter behavior. Ghost/diff layers keep the established rules
  (ghosts bypass filters; additions respect them). «Только срез» (active-slice view
  mode, ephemeral) composes AND with the persisted filter.
- Stale ids (deleted slices) in the stored set are inert and pruned by the panel's
  normalization on the next toggle (the established stale-nodeTypes pattern).
- domain: `Visualization.VisibleSlices *[]string \`json:"visibleSlices,omitempty"\``;
  client `opts` bag grows `visibleSlices?: string[]`.

## Approaches (all three storage designs considered in the brainstorm)

1. **v1 — Postgres `slices.node_ids` JSONB**: rejected — duplicates node references
   outside the element store, a stale-id consistency burden ("a second layouts").
2. **v2 — Neo4j `(:Slice)` nodes + `[:IN_SLICE]` rels**: structurally native M2M and
   self-cleaning, but rejected — auxiliary nodes/rels break the "store mirrors the
   user graph" invariant and move slice identity into Neo4j, against the
   identity-in-PG principle.
3. **v3 — PG identity + `sliceIds` system property** ✅: symmetric with how `graphs`
   itself is stored; Neo4j stays pure; rename/description edits are PG-only; node
   deletion cleans membership for free. Trade-offs accepted: slice deletion needs a
   sweep (soft), member queries scan the graph's elements.

## API (granular, idempotent; name-addressed, like visualizations)

| Method | Route | Semantics |
|---|---|---|
| POST | `/graphs/{id}/slices` `{name, description?, nodeIds?}` | 201 (populated atomically when nodeIds given); 409 name exists; 404 graph |
| GET | `/graphs/{id}/slices` | `[{id, name, description, nodeCount}]` |
| GET | `/graphs/{id}/slices/{name}` | `{id, name, description, nodes: [GraphNode]}` (hydrated) |
| PATCH | `/graphs/{id}/slices/{name}` `{name?, description?}` | 200 updated slice; 409 new name exists; 404 |
| POST | `/graphs/{id}/slices/{name}/nodes` `{ids}` | add (idempotent, unknown ids skipped) → `{nodeCount}` |
| DELETE | `/graphs/{id}/slices/{name}/nodes` `{ids}` | remove (idempotent) → `{nodeCount}` |
| DELETE | `/graphs/{id}/slices/{name}` | 204 — PG delete + membership sweep |

Backend structure: `postgres.SliceRepo` (identity CRUD incl. rename/description) +
`neo4j.SliceMembershipRepo` (property ops on :Element) + `service.SliceService`
(composes both, graph-existence check) + chi routes — the same DI pattern as
GraphService (PG + Neo4j halves).

## UI details

- **Slice panel** («Срезы» toolbar button): opens as an overlay panel over the canvas
  (not a modal); lists slices (name, trimmed description, member count); actions per
  slice: «Показать» (sets active slice), rename/edit inline, delete with
  `confirm()`; create form (name required, description optional). The active slice is
  highlighted in the list; a «Только срез» toggle (in the panel) dims/hides
  non-members, composing AND-style with type filters in the display pipeline.
  **Visibility filter**: each slice row carries a checkbox (checked = slice visible,
  default all checked); unchecking hides the slice's members (filter state is
  persisted with the visualization — see the Slice filter section). Rows also offer
  «Все» / «Ни одного» for the filter, mirroring the type-filter panels; the checkbox
  state is disabled (shown greyed) while no visualization is loaded.
- **Node context menu**: `onNodeContextMenu` (preventDefault); positioned at the
  cursor; content: per-slice rows with a checkbox reflecting membership (toggle on
  click → optimistic update, refetch slice list), plus «+ новый срез…» (name input
  inline; creates and adds the node). Closes on Escape / click-outside / scroll.
- **Edge context menu**: same list without checkboxes; click adds both endpoints;
  a row is disabled (with a hint) when both endpoints are already members.
- Member marking: nodes of the active slice get a CSS class (outline), edges derived
  (both endpoints members) — a thicker stroke.
- Context menus and the panel are plain DOM overlays in the editor container;
  jsdom-testable via `fireEvent.contextMenu` (our own listeners — no d3).

## Non-goals

- Per-slice visual styling beyond the active-slice marker, slice-of-slice,
  export/import, server-side projections by slice, moving the metamodel server-side,
  background cleanup of dead sids, bulk add/remove via area selection (context menus
  are per-element; a selection-based accelerator may come later), persisting the
  active slice / «Только срез» state (ephemeral — reload resets; URL param `?slice=`
  is a follow-up).

## archgen (self-description, same change)

- PG side: `tbl-slices` (table) with fields `id`, `graph_id` (FK→graphs, CASCADE),
  `name`, `description` (`has_field` ×4; `stored_in` → store-pg; `references` from
  `graph_id` → tbl-graphs).
- Neo4j side: `prp-element-sliceids` (property of `:Element`: «системное, 4-е
  зарезервированное; список UUID срезов; в API не exposed»), `has_property` from
  lbl-element.
- Domain: `ent-slice` (entity Slice) `persisted_as` → tbl-slices, `belongs_to` →
  ent-graph.
- Stable ids; new nodes/edges appended at the end; `make arch-regen` (PG_PORT-aware).

## Testing

- Postgres integration: migration up/down; CRUD round-trip incl. rename + description;
  UNIQUE (graph_id, name); rename collision; CASCADE from graphs;
  `layouts.visible_slices` round-trip (NULL ↔ set ↔ full replace; absent unchanged).
- Neo4j integration: add/remove single-statement semantics (idempotent, unknown ids
  skipped); **upsert preserves `sliceIds` while still deleting omitted user props**;
  `sliceIds` NOT present in `userProps`/API output (reserved-key leak test); node
  DETACH DELETE drops memberships; sweep removes sid from all elements.
- Service unit (stubs): composition, 404/409 mapping, count aggregation, atomic
  create-with-nodes.
- httpapi: route table incl. PATCH; 400/404/409; DELETE 204.
- Frontend: client methods; GraphEditor — panel (list/counts/description, create,
  rename inline, delete confirm), node context menu (opens on contextMenu, membership
  toggles fire correct calls, «новый срез» flow), edge context menu (adds both
  endpoints, disabled state), active-slice marker class, «Только срез» composes with
  type filters, menus close on Escape/click-outside; **slice filter** — unchecking a
  slice hides its members (node in two slices stays visible while either is checked),
  membership-free nodes always visible, edges follow endpoints, «Все»/«Ни одного»
  normalization, autosave payload includes `visibleSlices`, viz load restores it,
  filter composes AND with type filters and «Только срез».
- archgen: regen verified in the live DB (counts, stable ids).

## What's left to the builder (plan level)

- Exact Cypher statements; SliceService method set; panel/menu component decomposition
  and CSS values; optimistic-update policy for toggles (refetch vs local patch);
  context-menu positioning helpers; whether the member list in the panel shows ids
  when the marker view suffices (default: marker view only).
