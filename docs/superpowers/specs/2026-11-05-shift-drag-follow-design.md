# Shift-drag «тянет» связанные вершины с затуханием — Design

Date: 2026-11-05
Status: draft (brainstorm 2026-11-05)

## Context

Dragging a node today moves only that node (ReactFlow `NodeChange[position]` →
`useGraph.onNodesChange` → `applyNodeChanges` on `allNodes`). Users reshuffling a
graph want to move a whole neighborhood together, with nearer nodes following more
than distant ones — without rearranging everything by hand.

## Decisions (from brainstorm)

- **Interaction:** hold **Shift** while dragging a node → connected nodes follow in
  BFS rings by hop count. Without Shift — current single-node drag, untouched.
- **Falloff:** follower displacement = `delta × 0.5^ring` (1st ring ½, 2nd ¼, 3rd ⅛),
  **max depth 3 rings**; nodes beyond ring 3 do not move.
- **Approach A:** ReactFlow drag handlers + a pure `followDrag` function.
  Rejected B (intercepting `onNodesChange`: `NodeChange` carries no modifier state —
  would need fragile global keydown listeners) and C (shift-select + group drag: no
  falloff, different feature).
- **Adjacency: visible edges only** — hidden edge = missing edge (same semantics as
  the type filters and «Скрыть сироты»). Nodes hidden by filters never follow.
- **Multi-selection:** if the dragged node is part of a multi-selection, Shift-follow
  is disabled — plain group drag (ReactFlow native).
- Positions of followers land in `allNodes` via the drag session → saved in layouts
  by the existing `extractPositions(allNodes)` path; **no persistence changes**.

## Mechanics

New pure module `frontend/src/graph/followDrag.ts`:

- `planFollowers(visibleNodes, visibleEdges, draggedId): Map<string, number>` —
  BFS from `draggedId` over an adjacency built from `visibleEdges` (both endpoints
  visible), rings 1..3, values = ring number. `draggedId` itself excluded.
- `applyFollowDrag(startPositions, plan, delta): PositionMap` — for each follower:
  `start + delta × 0.5^ring`. Idempotent per tick: always computed from the
  drag-start snapshot, never from accumulated state.

Wiring (`useGraph` + `GraphCanvas` + `GraphEditor`):

- `GraphCanvas` accepts optional drag-handler props and forwards them to ReactFlow:
  `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop`.
- `useGraph` owns the drag session (a ref, not state — it mutates per tick):
  - **start** (`onNodeDragStart(event, node)`): if `event.shiftKey && !node.selected`
    (single drag) → snapshot `{ draggedId, startPositions (all visible nodes),
    plan: planFollowers(...) }` built from the current filtered `nodes`/`edges`;
    otherwise the session is null (plain drag).
  - **drag** (`onNodeDrag(event, node)`): if session active → read the dragged
    node's current position from the incoming change flow and set follower
    positions via `applyFollowDrag` into `allNodes` (`setAllNodes` map update).
    The dragged node itself keeps moving via ReactFlow's own changes.
  - **stop** (`onNodeDragStop`): clear the session. No extra work — positions are
    already in `allNodes`.
- Follower updates are visible instantly because followers are among the filtered
  `nodes` (they are visible by construction).

## Edge cases

- Dragged node has no visible edges → plan is empty → behaves as plain drag.
- Cycles / multiple paths: BFS visits each node once at its minimal ring.
- Filter toggles mid-drag: plan is frozen at drag start (consistent snapshot);
  next drag re-plans.
- `node.selected` true at drag start (multi-selection member) → no follow.
- Orphan-hidden nodes cannot follow (not in visible set).

## Out of scope

- Configurable factor/depth (constants are enough until asked).
- Shift-follow for multi-node drags.
- Any backend / layout-format changes.

## Testing

- `followDrag.test.ts`: ring assignment (line/branch/star); 0.5^ring displacement
  math; depth cap at 3 (ring-4 node stays); dragged node excluded; edges to
  invisible nodes ignored; idempotency (same inputs → same outputs).
- `useGraph.test.tsx`: simulated drag session (start with shift → move → stop)
  displaces followers in `allNodes` and in filtered `nodes`; without shift nothing
  follows; multi-selection (`node.selected`) → no follow.
- `GraphCanvas.test.tsx`: renders and forwards drag-handler props (smoke).
- `GraphEditor.test.tsx`: existing suite stays green (no toolbar/UI change).
