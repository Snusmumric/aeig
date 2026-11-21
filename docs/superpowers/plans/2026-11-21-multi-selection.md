# Multi-selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Space+drag box selection, Ctrl/Cmd+click accumulation (nodes AND edges), native group drag, bulk add selection to a slice.

**Architecture:** Frontend-only. GraphCanvas passes the selection props and wires `onEdgesChange`; useGraph applies edge select-changes; SlicePanel gains «Добавить выделенное (N)» with a slice picker; GraphEditor computes the selection union (edges → both endpoints). No backend changes.

**Spec:** `docs/superpowers/specs/2026-11-21-multi-selection-design.md`

**Global Constraints**
- `selectionKeyCode="Space"`, `panActivationKeyCode={null}`, `multiSelectionKeyCode={['Control','Meta']}`; plain drag = pan (unchanged); Shift+drag = follow-drag (unchanged; wave ignores multi-selection beyond the grabbed node).
- Selection ephemeral; pane-click/Escape clear (native); edges are selectable via `onEdgesChange`.
- Bulk add: ids = union(selected nodes, endpoints of selected edges), deduped; batch POST to existing endpoint; add-only.
- Testing levels per lessons: assert our wiring (select-changes, client calls), never d3 internals; Space modifier needs physical keydown in tests; edges need the measurement patch describe.

### Task 1: selection wiring
- [ ] Commit docs. RED: GraphEditor tests — Ctrl+click a node then another node → both `.selected`; click an edge (patched describe) → edge `.selected` + node stays; Escape → cleared. Implement: GraphCanvas props (selection constants) + `onEdgesChange` prop; useGraph `onEdgesChange` (applyEdgeChanges on allEdges) + return; GraphEditor passes it; App.css `.react-flow__node.selected`/`.react-flow__edge.selected` stronger outline. GREEN + full suite. Commit `feat(fe): multi-selection — box key (Space), Ctrl/Cmd accumulate, edges selectable`.

### Task 2: bulk to slice
- [ ] RED: SlicePanel — «Добавить выделенное (3)» visible when count>0, picker defaults to active slice, add calls onAddSelection(sliceId); GraphEditor — union computation (2 nodes + edge with distinct endpoints → 3 ids), client called with the batch, count 0 → control hidden. Implement: SlicePanelProps += selectionCount/onAddSelection; GraphEditor selection memos (selected nodes/edges) + handler reusing addSliceNodes flow + refetch. GREEN + gate (`npm test && npx tsc -b && npm run lint`). Commit `feat(fe): add selection to a slice from the panel`.

### Task 3: verify + refresh + demo
- [ ] Full gates; `make graph-refresh` + commit; demo: Space+drag box, Ctrl+click extras, group move, «Добавить выделенное», F5 (selection gone — ephemeral).
