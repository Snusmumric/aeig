# Edge layout: dynamic anchors + draggable bend — Design

Date: 2026-11-07
Status: draft (brainstorm 2026-11-07)

## Context

`TypedNode` renders exactly two fixed handles — target on the left, source on the right —
so every edge exits right and enters left regardless of geometry: back-links and
vertical neighbors draw hooks and loops. Edge geometry is stored nowhere: visualizations
keep node positions only, and ReactFlow has no built-in edge dragging.

## Intent and why

Edges should read cleanly at a glance: each edge attaches to the side of its node that
faces the other node (no hooks), and a user can bend an edge by dragging it (minimum:
the midpoint; accepted: sample points along the path) with the bend persisted in the
visualization.

## Goals

1. **Stage 1 — dynamic side anchors** (frontend-only, no persistence):
   - `TypedNode` renders 8 handles: `t/r/b/l` ids for source and for target, visually
     near-invisible dots (purely geometric anchors — there is no edge-creation UI).
   - For each displayed edge, pick the handle pair from the direction between node
     centers: `|dx| ≥ |dy|` → horizontal sides (exit toward the neighbor, entry facing
     back), else vertical. Recomputed from positions on every render — moving a node
     re-anchors live (works with shift-drag follow and filters for free).
   - Ghost edges get anchors too (positions known from the manifest).
2. **Stage 2 — draggable bend (model A) + persistence**:
   - Custom edge type `curvy`: quadratic Bézier from source-handle point through
     `straightMid + offset` to target-handle point; edge-type label rendered at the
     curve midpoint.
   - Grab circles at t = 0.25 / 0.50 / 0.75 of the path; dragging any of them sets the
     offset for that edge (`pointerdown` + `setPointerCapture` + `screenToFlowPosition`,
     propagation stopped so canvas pan does not trigger); **double-click on an edge
     resets its bend** (offset removed).
   - Offset is **relative** to the straight-line midpoint — node moves keep the shape.
   - Ghost edges render with the same path but no grab points (read-only).
   - `useGraph` gains `bends: Record<edgeId, {dx, dy}>` + `setBends`; loaded from the
     viz on open; drag marks dirty (autosave ≤ 10 s, beforeunload — all four PUT paths
     keep their failed-load guards).

## Non-goals

- Polyline routing (model B) — revisit later if single-bend proves limiting.
- Edge creation UI, edge label editing, boundary-exact anchor math (side midpoints only).
- Bending edges in the arch/data-model sense (this is presentation geometry only).

## Approaches (from brainstorm)

- **Anchors: native multi-handle + dynamic `sourceHandle/targetHandle` ids** ✅ vs
  custom clipping geometry against node bounds — rejected: fights ReactFlow's
  handle-based endpoint tracking, needs fragile DOM measurement.
- **Bend model: single relative offset (A)** ✅ vs polyline chain (B) — rejected for now:
  drag management of point chains is disproportionately expensive for the gain.

## Decisions (how it gets built)

### Anchor computation (pure function)

`pickHandles(p1: {x,y}, p2: {x,y}) → {source: 't'|'r'|'b'|'l', target: 't'|'r'|'b'|'l'}`:
direction d = p2 − p1 computed on **position + estimated center** (constant half-size
offset — nodes are similar-sized; approximation accepted and documented); `|dx| ≥ |dy|`
→ horizontal pair (source `r` if dx>0 else `l`, target the opposite), else vertical.
`d == 0` → horizontal default. Applied where display edges are derived (same memo as
filters — positions already a dependency). New module `edgeGeometry.ts` with
`pickHandles` + path math (`quadPath`, `quadPoint(t)`), unit-tested.

### Persistence — viz field `bends`

- Migration `0006`: `ALTER TABLE layouts ADD COLUMN bends JSONB NULL;` (down: drop).
- Wire: same JSONB mechanism as the manifest fields, but **layout-family write policy**:
  absent = unchanged, present = **full replace** of the map (like `positions`). Autosave
  and every explicit save include the bends map; sync refreshes it like positions.
  - **Self-pruning**: autosave sends bends built from the current `allEdges` (live ids
    only) — dead-edge bends disappear on the next autosave, no special pruning path.
- Go: `Bend struct { Dx, Dy float64 }`; `Visualization.Bends *map[string]Bend
  \`json:"bends,omitempty"\``; repo/service/httpapi passthrough exactly like
  `nodes`/`edges` (partial field, `json.RawMessage`, 1 MB cap unchanged).
- TS: `Bend { dx: number; dy: number }`; `Visualization.bends?`; client sends it in the
  same options argument slot as the manifest (plan level decides exact arg shape).
- Fork/overwrite carry current bends; sync sends bends := built-from-current-edges.

### `curvy` edge component

- Registered in `GraphCanvas` `edgeTypes`; **every displayed edge is `curvy`** — the
  default look of an unbent edge becomes a **straight segment** between the chosen
  anchors (replacing today's left/right bezier bow globally; double-click-reset returns
  to straight).
- **Through-point semantics**: the persisted `{dx, dy}` is the displacement of the point
  the curve passes through: `curve(0.5) = straightMid + offset`. The Bézier control
  point is derived: `C = M + 2·offset`. Pure helpers in `edgeGeometry.ts`:
  `quadControl(offset)`, `quadPoint(t)`; tests pin the factor-2 relationship.
- **Drag mapping — per-t inverse**: the curve point under the grabbed circle follows the
  cursor exactly. From pointer P at parameter t:
  `C = (P − (1−t)²·S − t²·T) / (2t(1−t))`, then `offset = (C − M)/2`. At t=0.5 this
  reduces to `offset = P − M`. All three circles are affordances for the same 2-DOF
  offset.
- Grab circles: three `<circle>` at `quadPoint(0.25/0.5/0.75)`, `r=6`, fill transparent
  (visible on edge hover via CSS `:hover` on the group), `pointerdown` starts the drag;
  cursor conversion via `useReactFlow().screenToFlowPosition`.
- Label: ReactFlow `EdgeText` at `quadPoint(0.5)`, existing edge type string.
- Dblclick on the path → `setBends` removes the edge's entry.
- Ghost edges: same component with `data.readOnly` → no circles, no dblclick handler.
- **Self-loops** (source == target — not creatable in UI, not forbidden by the backend):
  at render time such an edge gets an implicit default offset `{0, -60}` (visible arc
  above the node) unless a user bend exists; not persisted.

### archgen (self-description, same change)

`layouts` += `fld-layouts-bends` (`bends JSONB` — изгибы рёбер, относительные офсеты);
entity `EdgeBends` (`entity`, `part_of` → ent-layout, `serializes` → fld). Stable ids,
new nodes/edges appended at the end. `make arch-regen` after implementation.

## Edge cases

- Coincident node positions → horizontal default anchors.
- Edge hidden by filters → its bend stays in the map (harmless; pruned at next save of
  the pruned map only if the edge is truly gone — filter-hidden edges keep their bends).
- Shift-drag follow moves both endpoints → offset travels with the midpoint (shape kept).
- `bends` present but edge re-anchored → path recomputed from new handles, same offset.
- Two edges sharing a pair of nodes: default paths overlap; user bends one/both apart —
  that is the feature.

## Testing

- `edgeGeometry.test.ts`: `pickHandles` table (R/L/T/B quadrants, coincident, diagonal
  boundary `|dx| == |dy|`, self-loop pair); `quadControl`/`quadPoint` math (t=0/0.5/1,
  factor-2 through-point relation, per-t inverse round-trip: pointer at each t
  reproduces the same offset).
- `useGraph.test.tsx`: bends state set/cleared with viz load; bend change marks flow
  through GraphEditor dirty (covered there).
- `GraphEditor.test.tsx`: drag simulation on the grab circle (plain pointer events —
  no d3 involved, jsdom-friendly): pointerdown → move (+30,+10) → pointerup →
  `bends[edgeId] = {dx:30, dy:10}`; autosave PUT payload includes bends; dblclick
  removes; ghost edge renders without grab circles.
- Backend: bends round-trip (NULL vs map), partial absent-unchanged, full-replace —
  integration tests mirroring the manifest suites.
- archgen: +2 nodes appended, ids stable (verified in live DB).

## What's left to the builder (plan level)

- Exact client signature for the bends argument; handles styling values; hover CSS for
  grab circles; whether `pickHandles` uses `>=` or `>` at the diagonal boundary (tests
  pin whichever is chosen); Stage-1-vs-Stage-2 task split.
