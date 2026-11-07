# Edge directionality: per-type declaration + arrows — Design (short)

Date: 2026-11-07
Status: draft (brainstorm 2026-11-07, variant B picked)

## Context

Neo4j relationships are always directed and our `GraphEdge` always carries
`source`/`target` — but whether direction is *semantically meaningful* is declared
nowhere, and edges render without arrowheads. From the discussion: an "arbitrarily
oriented" edge (orientation is representation) differs from a directed one
(orientation is meaning) precisely by an invariant the system must know per relation
type; drawing an arrow on an arbitrary orientation asserts a false asymmetry.

## Decision (variant B)

Directionality is a property of the edge **type**, declared where edge styling already
lives — the frontend metamodel:

- `TypeStyle` (frontend/src/graph/typeStyle.ts) gains `directed?: boolean`
  (meaningful for edge-type entries).
- `toFlowEdges` sets `markerEnd: { type: MarkerType.ArrowClosed }` for edges whose
  resolved style has `directed: true`; undirected/unstyled types render arrowless.
- Ghost edges and added-edge overlays go through the same style resolution → arrows
  appear/disappear consistently in the diff view.
- `App.tsx` marks **directed: true** for every semantically directed edge type we ship:
  arch graph (stored_in, has_field, has_property, references, persisted_as, serializes,
  partitions, part_of, belongs_to), roadmap (contains, next, revisit, depends_on),
  sample depends_on, and the code-graph edge types (calls, imports, imports_from —
  they also get color entries, currently unstyled).
- Shift-drag follow BFS stays **bidirectional** for all types (unchanged): pulling a
  neighborhood is symmetric by intent; documented here as the deliberate rule.
- No storage, API, or migration changes: directionality is a metamodel/rendering
  concern; every stored edge remains an ordered pair.

## Self-description (user-requested)

`scripts/archgen.py`: `rel-rel` (:REL) node note updated to state the invariant —
«:REL всегда направлен (source→target); семантика направления — в метамодели типов
(направленные рисуются со стрелкой)». Label-only edit, id stable; regenerate +
`PG_PORT=5433 make arch-regen`; existing positions of the default viz untouched.
After the change the arch graph itself renders with arrows for all its directed types.

## Non-goals

- Per-edge directionality (attribute of a type, not an instance).
- Backend metamodel persistence (types live in the frontend styles today; moving them
  server-side is a separate future feature).
- Mixed arrow styles (single closed arrowhead).

## Testing

- `toFlow.test.ts`: directed type → edge has `markerEnd` ArrowClosed; undirected /
  unstyled → none; style flag resolved via TypeStyleMap.
- GraphEditor ghost-edge path: ghost edge of a directed type renders with marker.
- `App.tsx` no test (data), covered by the type entries themselves.
- archgen: regen verified in live DB (node count unchanged — note-only edit).
