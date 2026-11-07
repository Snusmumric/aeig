# Edge directionality (variant B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Edge types declare `directed`; directed edges render with arrowheads; no storage changes.

**Architecture:** One optional field on the existing frontend metamodel (`TypeStyle.directed`), consumed by `toFlowEdges` (markerEnd) and the ghost/added overlay path; `App.tsx` marks all shipped edge types; archgen note-only self-description update.

**Spec:** `docs/superpowers/specs/2026-11-07-edge-directionality-design.md`

**Global Constraints**
- `directed?: boolean` on `TypeStyle`; arrow = `markerEnd: { type: MarkerType.ArrowClosed }` ONLY for resolved `directed === true`; unstyled/undirected → arrowless.
- Directed set: stored_in, has_field, has_property, references, persisted_as, serializes, partitions, part_of, belongs_to, contains, next, revisit, depends_on, calls, imports, imports_from (last three also gain color entries).
- No backend/migration/API changes. Shift-drag BFS stays bidirectional.
- archgen: note-only edit on `rel-rel` (id stable); `PG_PORT=5433 make arch-regen`.
- TDD; suites green (`npm test`, `npx tsc -b`, `npm run lint`, `make test`); graph refresh + commit at the end.

### Task 1: frontend — TypeStyle.directed + arrows

**Files:** Modify `frontend/src/graph/typeStyle.ts`, `frontend/src/graph/toFlow.ts`, `frontend/src/App.tsx`; Test `frontend/src/graph/toFlow.test.ts`, `frontend/src/graph/GraphEditor.test.tsx` (ghost path).

- [ ] Failing tests: toFlowEdges with `{ T: { …, directed: true } }` → edge.markerEnd.type === 'arrowclosed'; without flag → markerEnd undefined; ghost edge of directed type renders marker (GraphEditor ghost fixture).
- [ ] RED → implement (TypeStyle field; toFlowEdges markerEnd via resolveStyle; App.tsx type entries) → GREEN; whole-suite gate.
- [ ] Commit `feat(fe): per-type edge directionality with arrowheads`.

### Task 2: archgen self-description + live apply

**Files:** Modify `scripts/archgen.py`; regenerate seed.

- [ ] Note-only edit on `rel-rel` per spec; `PG_PORT=5433 make arch-regen`; verify live: node count unchanged (47), note updated, default-viz positions intact.
- [ ] Commit `feat: self-description — :REL directionality invariant note`.

### Task 3: verify + graph refresh

- [ ] Full gates: `cd frontend && npm test && npx tsc -b && npm run lint`; `make test`.
- [ ] `make graph-refresh` + commit `chore: refresh code knowledge graph (edge directionality)`.
- [ ] Demo: user opens `…0003` — arrows on all edges (all arch types are directed).
