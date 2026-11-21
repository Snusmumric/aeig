# Multi-selection: box, Ctrl+click, group drag, bulk-to-slice — Design (short)

Date: 2026-11-21
Status: draft (brainstorm 2026-11-21)

## Context

The editor has no usable multi-selection: box selection was disabled
(`selectionKeyCode={null}`) when Shift was taken by follow-drag; Ctrl/Cmd+click works
for nodes only (edge selection is not wired — `onEdgesChange` is never passed);
nothing consumes a selection. Slices (v3.1) deferred bulk add explicitly — it arrives
here.

## Decision (user-picked)

**Space+drag = box selection; plain drag stays pan.** Pan is the high-frequency
action in this editor (navigating 200+ node graphs), selection is episodic — the
modifier carries the rare action, and no existing habit breaks.

## How

- `GraphCanvas`/`ReactFlow` props: `selectionKeyCode="Space"`, `panActivationKeyCode={null}`
  (frees Space from its default key-pan role; plain drag + wheel keep panning/zooming),
  `selectionOnDrag` stays off (the key is the trigger), `multiSelectionKeyCode={['Control','Meta']}`
  (user asked Ctrl; Cmd works too).
- Wire **edge selection**: `onEdgesChange` → apply select-changes (nodes already do);
  edges become selectable objects alongside nodes.
- **Group drag**: native ReactFlow — dragging a selected node moves the whole
  selection; position changes flow through the existing dirty/autosave path.
  **Shift+drag keeps its meaning** (follow-drag wave from the grabbed node) — rule:
  plain drag = move, Shift = wave; the existing ≤1-selected guard on the wave stays
  (a multi-selection Shift-drag follows the grabbed node only).
- **Clear selection**: click on empty pane / Escape (native ReactFlow behavior).
- **Bulk to slice**: in the SlicePanel — «Добавить выделенное (N)» control, enabled
  when selection > 0: a slice picker (dropdown of existing slices; defaults to the
  active one) + immediate add. Selected **edges contribute both endpoints** (the
  context-menu rule); ids = union(selected node ids, endpoints of selected edges),
  deduped. Uses the existing batch `POST …/slices/{name}/nodes` — no backend changes.
- Selection is **ephemeral** (never persisted, like the active slice).
- Selection styling: ReactFlow's built-in selected classes; strengthen visually in
  `App.css` (selected node outline, selected edge stroke) so group state is obvious.

## Non-goals

- Persisting selection in the visualization; shift/arrows keyboard range selection;
  lasso (free-form) selection; slice remove via selection (add-only, mirroring the
  context menu's asymmetry is NOT kept — panel is add-only for now).

## Testing

- Props wiring: jsdom assertions on ReactFlow props are not observable — pin via
  behavior: physical **Space keydown** then pane pointer-drag selects nodes within the
  rect (follow the project lesson: modifiers need real key dispatch; box-selection
  internals are d3/jsdom-blind — assert on the selection state changes, e.g.
  `onNodesChange` select events, not on the drawn rectangle).
- Ctrl/Cmd+click accumulates node selection; click on a second edge selects it
  (`onEdgesChange` wired).
- Group drag: dragging one selected node fires position changes for all selected
  (assert via onNodesChange batch).
- Bulk-to-slice: with 2 nodes + 1 edge selected, «Добавить выделенное (3)» calls the
  client with the union incl. both edge endpoints; disabled at 0; default target =
  active slice; picker lists all slices.
- Shift-drag on a multi-selection still triggers follow-drag for the grabbed node only
  (existing wave tests stay green).
- Escape/click clears selection.

## Left to the builder (plan level)

- Whether the slice picker is a `<select>` or reuses the context-menu list pattern;
  exact selected-state CSS values; box-selection `selectionMode` (partial vs full
  intersection — default partial).
