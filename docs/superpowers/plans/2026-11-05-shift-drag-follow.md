# Shift-drag follow implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holding Shift while dragging a node makes connected nodes follow in BFS rings with displacement `delta × 0.5^ring`, max ring 3, over visible edges only.

**Architecture:** Pure module `followDrag.ts` (BFS ring planning + idempotent position math), a drag-session ref inside `useGraph` driven by ReactFlow's `onNodeDragStart/onNodeDrag/onNodeDragStop`, forwarded through `GraphCanvas`. The dragged node moves via the existing `onNodesChange` flow; only follower positions are written by the session.

**Tech Stack:** React 19, @xyflow/react 12 (`OnNodeDrag` handlers), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-shift-drag-follow-design.md`

## Global Constraints

- Frontend only, under `frontend/src/graph/`; no new dependencies; no backend or layout-format changes (spec: Out of scope).
- Falloff constants exactly: ring factor `0.5`, max depth `3` rings — nodes at ring ≥ 4 never move (spec: Decisions).
- Adjacency = **visible edges only**; followers must be among currently visible nodes (spec: Decisions).
- Multi-selection (≥ 2 selected visible nodes at drag start) disables follow; a lone selected dragged node still follows (spec: Decisions).
- Without Shift, behavior is byte-identical to today's drag (spec: Context).
- Follower positions are computed from the drag-start snapshot every tick (idempotent, no accumulated deltas).
- Commands (repo root): targeted tests `cd frontend && npx vitest run <files>`; full `cd frontend && npm test`; lint `npm run lint`; type check `npm run build`; after code: `make graph-refresh` + commit graphify-out files (CLAUDE.md cadence).
- Commit style: conventional, English subject — `feat(fe): …`, `docs(spec): …`, `chore: refresh code knowledge graph (…)`.

## Review Focus

1. Touch-drag events carry no `shiftKey` (React TouchEvent) — handler must not crash and must not follow → useGraph test "touch event (no shiftKey) is a plain drag" (Task 2).
2. Ring-4 and beyond must not move even in a long chain → followDrag test "chain of 5 assigns ring 4 node no displacement" (Task 1).
3. Grabbed node selected but alone (single selection) must still follow — only ≥2 selected disables → useGraph test "single selected node still follows with shift" (Task 2).
4. Edge referencing a node outside the visible set must be ignored by planning → followDrag test "edges to unknown endpoints are ignored" (Task 1).
5. Filter toggled mid-drag must not re-plan the wave — plan is frozen at drag start → useGraph test "filter change during drag does not re-plan followers" (Task 2).

---

### Task 1: Pure `followDrag` module

**Files:**
- Create: `frontend/src/graph/followDrag.ts`
- Test: `frontend/src/graph/followDrag.test.ts`

**Interfaces:**
- Produces (Task 2 consumes exactly these):
  - `export const FOLLOW_MAX_RING = 3` and `export const FOLLOW_FACTOR = 0.5`
  - `export function planFollowers(visibleNodes: Node[], visibleEdges: Edge[], draggedId: string): Map<string, number>` — follower id → ring 1..3; undirected BFS from `draggedId`; edges count only when both endpoints are in `visibleNodes`; `draggedId` itself never in the map; empty map when no visible edges touch it.
  - `export function applyFollowDrag(starts: Record<string, { x: number; y: number }>, plan: Map<string, number>, delta: { x: number; y: number }): Record<string, { x: number; y: number }>` — returns new positions **for followers only**; `start + delta × 0.5^ring`; no mutation of inputs.

- [ ] **Step 1: Commit the spec and plan docs**

```bash
git add docs/superpowers/specs/2026-11-05-shift-drag-follow-design.md docs/superpowers/plans/2026-11-05-shift-drag-follow.md
git commit -m "docs(spec): shift-drag follow design + plan"
```

- [ ] **Step 2: Write the failing tests** (`followDrag.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import { FOLLOW_FACTOR, FOLLOW_MAX_RING, planFollowers, applyFollowDrag } from './followDrag'

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} })
const edge = (id: string, source: string, target: string): Edge => ({ id, source, target })

describe('planFollowers', () => {
  it('assigns BFS rings undirected from the dragged node', () => {
    // a(root) - b - c - d - e  plus  a - e (cycle back)
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(node)
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd'), edge('e4', 'd', 'e'), edge('e5', 'e', 'a')]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.get('e')).toBe(1)      // direct via e5, despite 4-hop path the other way
    expect(plan.get('c')).toBe(2)
    expect(plan.get('d')).toBe(2)      // a-e-d is 2 hops — minimal ring wins
    expect(plan.has('a')).toBe(false)
  })

  it('chain of 5 caps at ring 3: ring-4 node gets no entry', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map(node)
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'd'), edge('e4', 'd', 'e')]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.get('c')).toBe(2)
    expect(plan.get('d')).toBe(3)
    expect(plan.has('e')).toBe(false)  // ring 4 — beyond FOLLOW_MAX_RING
    expect(FOLLOW_MAX_RING).toBe(3)
    expect(FOLLOW_FACTOR).toBe(0.5)
  })

  it('edges to unknown endpoints are ignored', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'ghost')]
    const plan = planFollowers(nodes, edges, 'a')
    expect(plan.get('b')).toBe(1)
    expect(plan.size).toBe(1)
  })

  it('no visible edges touching the node yields an empty plan', () => {
    const plan = planFollowers([node('a'), node('b')], [edge('e1', 'b', 'c')], 'a')
    expect(plan.size).toBe(0)
  })
})

describe('applyFollowDrag', () => {
  const starts = { f1: { x: 100, y: 200 }, f2: { x: 0, y: 0 }, f3: { x: -10, y: 10 } }
  const plan = new Map([['f1', 1], ['f2', 2], ['f3', 3]])

  it('displaces each follower by delta × 0.5^ring', () => {
    const out = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    expect(out.f1).toEqual({ x: 100 + 40, y: 200 + 20 })  // ½
    expect(out.f2).toEqual({ x: 0 + 20, y: 0 + 10 })      // ¼
    expect(out.f3).toEqual({ x: -10 + 10, y: 10 + 5 })    // ⅛
  })

  it('is idempotent: same inputs, same outputs (no accumulation)', () => {
    const once = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    const twice = applyFollowDrag(starts, plan, { x: 80, y: 40 })
    expect(once).toEqual(twice)
    expect(starts.f2).toEqual({ x: 0, y: 0 })  // inputs not mutated
  })

  it('returns entries only for planned followers', () => {
    const out = applyFollowDrag({ ...starts, other: { x: 1, y: 1 } }, plan, { x: 0, y: 0 })
    expect(Object.keys(out).sort()).toEqual(['f1', 'f2', 'f3'])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/graph/followDrag.test.ts`
Expected: FAIL — module `./followDrag` not found.

- [ ] **Step 4: Implement `frontend/src/graph/followDrag.ts`**

Signatures per Interfaces block. Body approach: build `Set` of visible ids, adjacency `Map<string, string[]>` from edges with both endpoints in the set; BFS queue seeded with `draggedId` at ring 0, expand only while `ring < FOLLOW_MAX_RING`; `applyFollowDrag` is a plain loop `factor ** ring`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/followDrag.test.ts`
Expected: PASS (7 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/graph/followDrag.ts frontend/src/graph/followDrag.test.ts
git commit -m "feat(fe): pure followDrag planner and ring-falloff math"
```

### Task 2: Drag session in `useGraph`

**Files:**
- Modify: `frontend/src/graph/useGraph.ts`
- Test: `frontend/src/graph/useGraph.test.tsx`

**Interfaces:**
- Consumes: `planFollowers`, `applyFollowDrag`, `FOLLOW_MAX_RING`, `FOLLOW_FACTOR` (Task 1).
- Produces (Task 3 consumes): `UseGraph` gains three handlers, typed with @xyflow/react's `OnNodeDrag` (default generic): `onNodeDragStart: OnNodeDrag`, `onNodeDrag: OnNodeDrag`, `onNodeDragStop: OnNodeDrag`. Internal (not exported): `interface DragSession { draggedId: string; starts: Record<string, { x: number; y: number }>; plan: Map<string, number> }` kept in a `useRef<DragSession | null>`.

- [ ] **Step 1: Write the failing tests** (append to `useGraph.test.tsx`; reuse `fakeClient` — fixture nodes n1, n2, n3 and edges e1 `depends_on` n1→n2, e2 `blocks` n2→n3)

Helpers + cases:

```tsx
type DragEvt = { shiftKey?: boolean }
const drag = (n: { id: string; position: { x: number; y: number } }, shiftKey?: boolean) =>
  [({ shiftKey } as DragEvt) as never, n as never, [n] as never] as const
```

```tsx
it('shift-drag displaces followers by ring falloff', async () => {
  const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
  await act(async () => { await result.current.reload() })
  const n1 = result.current.nodes.find((n) => n.id === 'n1')!
  const n2 = result.current.nodes.find((n) => n.id === 'n2')!
  const n3 = result.current.nodes.find((n) => n.id === 'n3')!
  const start1 = { ...n1.position }
  const start2 = { ...n2.position }
  const start3 = { ...n3.position }
  act(() => { result.current.onNodeDragStart(...drag(n1, true)) })
  act(() => {
    result.current.onNodeDrag(...drag({ ...n1, position: { x: start1.x + 80, y: start1.y + 40 } }, true))
  })
  // n2 ring 1 (e1 n1–n2), n3 ring 2 (e2 n2–n3)
  expect(result.current.nodes.find((n) => n.id === 'n2')!.position)
    .toEqual({ x: start2.x + 40, y: start2.y + 20 })  // ½ of delta
  expect(result.current.nodes.find((n) => n.id === 'n3')!.position)
    .toEqual({ x: start3.x + 20, y: start3.y + 10 })  // ¼ of delta
  act(() => { result.current.onNodeDragStop(...drag(n1, true)) })
})
```

```tsx
it('drag without shift moves nothing but the dragged node', async () => {
  // same fixture; onNodeDragStart(...drag(n1, false)); onNodeDrag(... +80 …)
  // n2/n3 positions unchanged
})

it('touch event (no shiftKey) is a plain drag', async () => {
  // onNodeDragStart(...drag(n1, undefined)) — handler must not throw; n2/n3 unchanged
})

it('single selected node still follows with shift', async () => {
  // act: result.current.onNodesChange([{ id: 'n1', type: 'select', selected: true }])
  // then shift-drag as in the first case → n2 follows
})

it('multi-selection disables follow', async () => {
  // select n1 and n2 via two 'select' changes, then shift-drag n1 → n2/n3 unchanged
})

it('filter change during drag does not re-plan followers', async () => {
  // shift-drag start on n1; move tick 1 (+80) → n2 moved ½
  // setVisibleTypes(new Set(['Task', 'Milestone'])) mid-drag (still visible);
  // move tick 2 (+160) → n2 still displaced by exactly ½ of 160 from its start (plan frozen)
})

it('non-shift drag after a shift drag session is plain', async () => {
  // full shift session then a fresh non-shift drag → followers stay at follower-session end positions
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/graph/useGraph.test.tsx`
Expected: FAIL — `onNodeDragStart` etc. not functions on `result.current`.

- [ ] **Step 3: Implement in `useGraph.ts`**

- Add `dragSession = useRef<DragSession | null>(null)`.
- `const shiftOf = (event: Parameters<OnNodeDrag>[0]) => 'shiftKey' in event && event.shiftKey === true`
- `onNodeDragStart = useCallback((event, draggedNode) => { ... }, [nodes, edges])`:
  session starts only when `shiftOf(event) && nodes.filter((n) => n.selected).length <= 1`;
  then `starts` = snapshot of current filtered `nodes` positions, `plan = planFollowers(nodes, edges, draggedNode.id)`; else session = `null`.
- `onNodeDrag = useCallback((event, draggedNode) => {...}, [])`:
  if `dragSession.current?.draggedId !== draggedNode.id` → return;
  `delta = draggedNode.position − starts[draggedId]`;
  `const next = applyFollowDrag(starts, plan, delta)`;
  `setAllNodes((nds) => nds.map((n) => next[n.id] ? { ...n, position: next[n.id] } : n))`.
- `onNodeDragStop = useCallback(() => { dragSession.current = null }, [])`.
- Extend `UseGraph` interface + return object with the three handlers.
- The dragged node itself keeps moving through the existing `onNodesChange` path — the session never writes `draggedId` (it is not in the plan).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/useGraph.test.tsx`
Expected: PASS (new + all existing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/useGraph.ts frontend/src/graph/useGraph.test.tsx
git commit -m "feat(fe): useGraph drag session follows neighbors with ring falloff"
```

### Task 3: Forward drag handlers through `GraphCanvas` and `GraphEditor`

**Files:**
- Modify: `frontend/src/graph/GraphCanvas.tsx`, `frontend/src/graph/GraphEditor.tsx`
- Test: `frontend/src/graph/GraphCanvas.test.tsx`

**Interfaces:**
- Consumes: the three `UseGraph` handlers (Task 2).
- Produces: `GraphCanvasProps` gains `onNodeDragStart?: OnNodeDrag`, `onNodeDrag?: OnNodeDrag`, `onNodeDragStop?: OnNodeDrag` (imported type from '@xyflow/react'), forwarded verbatim to `<ReactFlow>`.

- [ ] **Step 1: Write the failing test** (append to `GraphCanvas.test.tsx`)

```tsx
it('renders with drag handler props without crashing', () => {
  const noop = () => {}
  render(
    <GraphCanvas
      nodes={[]}
      edges={[]}
      onNodeDragStart={noop as never}
      onNodeDrag={noop as never}
      onNodeDragStop={noop as never}
    />,
  )
  expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
})
```

(ReactFlow's internal drag pipeline is not simulated in jsdom — behavior is covered by the Task 2 hook tests; this pins the prop surface.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/graph/GraphCanvas.test.tsx`
Expected: FAIL — `onNodeDragStart` not in `GraphCanvasProps`.

- [ ] **Step 3: Implement**

- `GraphCanvas.tsx`: add the three optional props to the interface, destructure, pass to `<ReactFlow>`; also pass the existing `onNodesChange` unchanged.
- `GraphEditor.tsx`: destructure `onNodeDragStart, onNodeDrag, onNodeDragStop` from `useGraph(...)` and pass to `<GraphCanvas ... />`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/GraphCanvas.test.tsx src/graph/GraphEditor.test.tsx`
Expected: PASS (canvas smoke + full GraphEditor suite).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/GraphCanvas.tsx frontend/src/graph/GraphCanvas.test.tsx frontend/src/graph/GraphEditor.tsx
git commit -m "feat(fe): wire shift-drag follow handlers into the canvas"
```

### Task 4: Full verification + knowledge-graph refresh

**Files:**
- Modify: `graphify-out/` (generated)

- [ ] **Step 1: Run the whole frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, zero failures.

- [ ] **Step 2: Lint and type check**

Run: `cd frontend && npm run lint && npm run build`
Expected: lint clean; `tsc -b` + vite build succeed.

- [ ] **Step 3: Refresh and commit the knowledge graph**

```bash
make graph-refresh
git add graphify-out/graph.json graphify-out/GRAPH_REPORT.md graphify-out/.graphify_labels.json
git commit -m "chore: refresh code knowledge graph (shift-drag follow)"
```

Expected: commit succeeds; `git status` clean afterwards (except pre-existing unrelated changes, if any).
