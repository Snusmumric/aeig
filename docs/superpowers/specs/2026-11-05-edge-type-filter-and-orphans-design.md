# Edge-type filter + «Скрыть сироты» + remove «Add Task» — Design

Date: 2026-11-05
Status: draft (brainstorm 2026-11-05)

## Context

The editor has a node-type filter (toolbar checkboxes, 2026-10-04). Two new capabilities
are needed on the canvas, plus one removal:

1. Hide edges by type — same checkbox UX as node types.
2. «Скрыть сироты» toggle — hides/shows orphan nodes. An orphan is a node with **zero
   visible edges in the current visualization**: hidden edge = missing edge, real DB
   edges do not count.
3. Remove the «Add Task» button (its purpose will be revisited later).

## Decisions (from brainstorm)

- **Frontend-only.** Edge-type visibility and the orphan toggle are session state and
  are **not** persisted in layouts.
- **Panel approach A:** generalize `TypeFilterPanel` into one reusable component
  rendered twice (nodes + edges), instead of duplicating a separate edge panel.
- **«Скрыть сироты» button:** fixed label, pressed state + `aria-pressed`
  (no label switching).
- **«Add Task»:** remove the button and the `addNode` callback from `GraphEditor`;
  `newNodeMutation` stays in `commit.ts` (tested, will be needed again).

## UI

Toolbar order: `LayoutBar` → node-type panel → edge-type panel → «Скрыть сироты».

Edge panel (second `TypeFilterPanel` instance):

- one checkbox per edge type present in the **full** subgraph (unique types of
  `sg.edges`, alphabetical), color swatch from the edge's `TypeStyleMap` entry
  (the same style that colors the edge line)
- «Все» / «Ни одного» buttons; default: everything checked
- testids: `edge-type-filter`, `edge-type-<type>`; node instance keeps
  `type-filter` / `type-<type>`

«Скрыть сироты»: toggle button after the filter panels; visually pressed + 
`aria-pressed` when active.

## State & semantics

`useGraph` additions (mirroring the node filter):

- `edgeTypes: string[]` — all edge types of the current subgraph, sorted
- `visibleEdgeTypes: Set<string> | null` — `null` = no filtering
- `hideOrphans: boolean` — default `false`

`filterFlow(allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans)` —
pure, applied in this order:

1. keep nodes whose type is in `visibleTypes` (existing)
2. keep edges whose type is in `visibleEdgeTypes`
3. keep edges whose both endpoints are among kept nodes (existing)
4. if `hideOrphans`: drop nodes with zero remaining (visible) edges

No cascade needed at step 4: an orphan has no visible edges, so hiding it cannot
change any other node's visible-edge count. One pass is a fixpoint.

## Layout interaction

- Save: unchanged — positions from `allNodes` + `nodeTypes` only.
- Load: applies `positions` and replaces `visibleTypes` (existing behavior);
  `visibleEdgeTypes` and `hideOrphans` are **untouched** by load/save (session state).

## Edge cases

- An isolated node (no edges at all) is an orphan.
- All edge types unchecked → every node becomes an orphan → with «Скрыть сироты» on
  the canvas is empty. Allowed, no special-casing.
- Toggling node/edge filters re-computes the orphan set live (derived state).
- When node creation returns to the UI later, it must handle `hideOrphans`
  (a freshly created edge-less node would be hidden) — note for that future change.

## Out of scope

- Persisting edge-type visibility / orphan toggle in layouts (backend + migration) —
  explicitly deferred by decision.
- Any backend changes.

## Testing

- `filterFlow.test.ts`: edge-type subset; node-type filter makes edge's endpoint
  vanish → edge gone; hidden edge type turns connected node into orphan;
  `hideOrphans` drops isolated nodes; `null`/`false` passthrough unchanged.
- `TypeFilterPanel.test.tsx`: generalized props (testid prefix); existing node tests
  keep passing via new props.
- `useGraph.test.tsx`: `edgeTypes` sorted; `visibleEdgeTypes` filters edges;
  `hideOrphans` filters nodes.
- `GraphEditor.test.tsx`: edge checkboxes render and toggle; «Скрыть сироты»
  hides/shows orphans; «Add Task» removed (mount test re-anchored).
