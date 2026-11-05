# Edge-type filter + «Скрыть сироты» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar checkbox panel that hides edges by type, a «Скрыть сироты» toggle that hides nodes with zero visible edges, and remove the «Add Task» button.

**Architecture:** Same pattern as the existing node-type filter: session state in `useGraph`, pure filtering in `filterFlow`, toolbar UI in `GraphEditor`. Edge domain types ride on flow edges via a new `TypedEdgeData` so the filter never reads display strings.

**Tech Stack:** React 19, @xyflow/react 12, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-05-edge-type-filter-and-orphans-design.md`

## Global Constraints

- Frontend only: every change lives under `frontend/src/graph/`. No backend, API type, or `package.json` changes; no new dependencies (spec: Out of scope).
- `visibleEdgeTypes` and `hideOrphans` are session state: never sent in `saveLayout`, never modified by layout load (spec: Decisions).
- «Add Task» is fully removed from `GraphEditor` (button, `addNode`, and the now-unused `notice` state). `commit.ts` and `commit.test.ts` stay untouched (spec: Decisions).
- Commands (from repo root): targeted tests `cd frontend && npx vitest run <files>`; full suite `cd frontend && npm test`; lint `cd frontend && npm run lint`; type check `cd frontend && npm run build` (runs `tsc -b`).
- Commit style: conventional, English subject — `feat(fe): …`, `docs(spec): …`, `chore: refresh code knowledge graph (…)`.
- The knowledge graph is rebuilt only via `make graph-refresh` (never bare `graphify update .`), then `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/.graphify_labels.json` are committed (CLAUDE.md enforced cadence — final task).

## Review Focus

1. `hideOrphans` on while both type filters are `null` — an identity shortcut on `visibleTypes == null` must not skip orphan removal → filterFlow.test "hideOrphans drops isolated nodes when no type filters are active" (Task 1).
2. All edge types unchecked + «Скрыть сироты» → completely empty canvas, no crash → filterFlow.test "all edge types hidden with hideOrphans empties the canvas" (Task 1).
3. Edge-type filter alone must never hide endpoint nodes (only the orphan mode may) → filterFlow.test "filters edges by type while keeping endpoint nodes" and useGraph.test "applies visibleEdgeTypes to edges only" (Tasks 1, 3).
4. Loading a layout replaces `visibleTypes` only — session edge filter and orphan toggle survive → GraphEditor.test "layout load does not reset the edge filter or orphan toggle" (Task 4).
5. New edge types appearing after a reload: `edgeTypes` recomputes from `allEdges`; stale entries in an active set are pruned by the panel's existing normalization on next toggle → useGraph.test "exposes sorted edgeTypes…" (Task 3); pruning pinned by the existing TypeFilterPanel "prunes stale types" test (Task 2 keeps it green).

---

### Task 1: Edge type on flow edges + `filterFlow` edge filter and orphans

**Files:**
- Modify: `frontend/src/graph/toFlow.ts` (toFlowEdges carries `edgeType`)
- Modify: `frontend/src/graph/filterFlow.ts`
- Test: `frontend/src/graph/filterFlow.test.ts`, `frontend/src/graph/toFlow.test.ts`

**Interfaces:**
- Consumes: existing `TypedNodeData`, `resolveStyle` (unchanged).
- Produces (later tasks rely on these exact names):
  - `toFlow.ts`: `export interface TypedEdgeData { edgeType: string }`; `toFlowEdges(sg: Subgraph, styles: TypeStyleMap): Edge<TypedEdgeData>[]`
  - `filterFlow.ts`: `filterFlow(allNodes: Node<TypedNodeData>[], allEdges: Edge<TypedEdgeData>[], visibleTypes: Set<string> | null, visibleEdgeTypes: Set<string> | null = null, hideOrphans = false): { nodes: Node<TypedNodeData>[]; edges: Edge<TypedEdgeData>[] }`

- [ ] **Step 1: Commit the spec and plan docs**

```bash
git add docs/superpowers/specs/2026-11-05-edge-type-filter-and-orphans-design.md docs/superpowers/plans/2026-11-05-edge-type-filter-and-orphans.md
git commit -m "docs(spec): edge-type filter and hide-orphans design + plan"
```

- [ ] **Step 2: Write the failing tests**

`filterFlow.test.ts` — change the `edge` helper to carry a type (existing tests keep passing):

```ts
const edge = (id: string, source: string, target: string, edgeType = 'rel'): Edge<TypedEdgeData> =>
  ({ id, source, target, data: { edgeType } })
```

Add fixture and cases (nodes fixture `allNodes` unchanged: n1 `service`, n2/n3 `domain`):

```ts
const tEdges = [edge('e1', 'n1', 'n2', 'calls'), edge('e2', 'n2', 'n3', 'owns')]

it('filters edges by type while keeping endpoint nodes', () => {
  const out = filterFlow(allNodes, tEdges, null, new Set(['owns']))
  expect(out.edges.map((e) => e.id)).toEqual(['e2'])
  expect(out.nodes).toBe(allNodes)
})

it('hideOrphans drops isolated nodes when no type filters are active', () => {
  const nodes = [...allNodes, node('n4', 'service')]
  const out = filterFlow(nodes, tEdges, null, null, true)
  expect(out.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3'])
})

it('a hidden edge type turns its endpoint into an orphan under hideOrphans', () => {
  const out = filterFlow(allNodes, tEdges, null, new Set(['calls']), true)
  expect(out.edges.map((e) => e.id)).toEqual(['e1'])
  expect(out.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
})

it('all edge types hidden with hideOrphans empties the canvas', () => {
  const out = filterFlow(allNodes, tEdges, null, new Set(), true)
  expect(out.nodes).toHaveLength(0)
  expect(out.edges).toHaveLength(0)
})
```

Import `TypedEdgeData` from `./toFlow` in the test file.

`toFlow.test.ts` — extend the existing "maps edges" case:

```ts
expect(edges[0].data).toEqual({ edgeType: 'depends_on' })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/graph/filterFlow.test.ts src/graph/toFlow.test.ts`
Expected: FAIL — filterFlow cases (extra args ignored → wrong output / `toBe` fails), toFlow `data` undefined.

- [ ] **Step 4: Implement**

`toFlow.ts`: add `export interface TypedEdgeData { edgeType: string }`; in `toFlowEdges` return `Edge<TypedEdgeData>[]` and add `data: { edgeType: e.type }` to each mapped edge (keep `label`, `style` as-is).

`filterFlow.ts` — signature per Interfaces block; body:

```ts
if (!visibleTypes && !visibleEdgeTypes && !hideOrphans) return { nodes: allNodes, edges: allEdges }
const nodes = visibleTypes ? allNodes.filter((n) => visibleTypes.has(n.data.nodeType)) : allNodes
const visible = new Set(nodes.map((n) => n.id))
let edges = allEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
if (visibleEdgeTypes) edges = edges.filter((e) => visibleEdgeTypes.has(e.data.edgeType))
if (hideOrphans) {
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]))
  return { nodes: nodes.filter((n) => connected.has(n.id)), edges }
}
return { nodes, edges }
```

(`nodes` stays the same array reference when `visibleTypes` is null — that is what the `toBe(allNodes)` assertion pins.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/filterFlow.test.ts src/graph/toFlow.test.ts`
Expected: PASS (all cases, including the pre-existing three).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/graph/toFlow.ts frontend/src/graph/filterFlow.ts frontend/src/graph/toFlow.test.ts frontend/src/graph/filterFlow.test.ts
git commit -m "feat(fe): filterFlow filters edges by type and drops orphans"
```

### Task 2: Generalize `TypeFilterPanel` with a testid prefix

**Files:**
- Modify: `frontend/src/graph/TypeFilterPanel.tsx`
- Test: `frontend/src/graph/TypeFilterPanel.test.tsx`

**Interfaces:**
- Produces: `TypeFilterPanelProps` gains `testPrefix?: string` (default `'type'`); container testid `` `${testPrefix}-filter` ``, checkbox testid `` `${testPrefix}-${t}` ``. All existing props/behavior unchanged — Task 4 renders the second instance with `testPrefix="edge-type"`.

- [ ] **Step 1: Write the failing test** (append to `TypeFilterPanel.test.tsx`)

```tsx
it('renders with an alternate testid prefix for edge types', () => {
  const onChange = vi.fn()
  render(
    <TypeFilterPanel
      types={['depends_on']}
      visibleTypes={null}
      styles={styles}
      onChange={onChange}
      testPrefix="edge-type"
    />,
  )
  expect(screen.getByTestId('edge-type-filter')).toBeInTheDocument()
  expect(screen.getByTestId('edge-type-depends_on')).toBeChecked()
  fireEvent.click(screen.getByTestId('edge-type-depends_on'))
  expect(onChange).toHaveBeenCalledWith(new Set())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/graph/TypeFilterPanel.test.tsx`
Expected: FAIL — prop `testPrefix` not accepted / `edge-type-filter` testid not found.

- [ ] **Step 3: Implement**

Add `testPrefix = 'type'` to the props destructuring and the interface; replace the two hardcoded testids with `` `${testPrefix}-filter` `` and `` `${testPrefix}-${t}` ``. Nothing else changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/TypeFilterPanel.test.tsx`
Expected: PASS (new case + all six existing cases with default prefix).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/TypeFilterPanel.tsx frontend/src/graph/TypeFilterPanel.test.tsx
git commit -m "feat(fe): TypeFilterPanel accepts a testid prefix for reuse"
```

### Task 3: `useGraph` session state for edge filter and orphans

**Files:**
- Modify: `frontend/src/graph/useGraph.ts`
- Test: `frontend/src/graph/useGraph.test.tsx`

**Interfaces:**
- Consumes: `TypedEdgeData` and the extended `filterFlow` (Task 1).
- Produces (exact names used by Task 4): in `UseGraph` — `edgeTypes: string[]`, `visibleEdgeTypes: Set<string> | null`, `setVisibleEdgeTypes: Dispatch<SetStateAction<Set<string> | null>>`, `hideOrphans: boolean`, `setHideOrphans: Dispatch<SetStateAction<boolean>>`.

- [ ] **Step 1: Write the failing tests**

In `fakeClient()` add a second edge (and keep node fixture n1 `Task`, n2 `Milestone`, n3 `Task`):

```ts
edges: [
  { id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} },
  { id: 'e2', type: 'blocks', source: 'n2', target: 'n3', properties: {} },
],
```

Update the existing "exposes sorted types…" case: with `visibleTypes = new Set(['Task', 'Milestone'])` the last assertion becomes `expect(result.current.edges).toHaveLength(2)` (the `Set(['Task'])` mid-case still expects 0 edges). Add:

```ts
it('exposes sorted edgeTypes and applies visibleEdgeTypes to edges only', async () => {
  const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
  await act(async () => { await result.current.reload() })
  expect(result.current.edgeTypes).toEqual(['blocks', 'depends_on'])
  expect(result.current.visibleEdgeTypes).toBeNull()
  act(() => { result.current.setVisibleEdgeTypes(new Set(['blocks'])) })
  expect(result.current.edges.map((e) => e.id)).toEqual(['e2'])
  expect(result.current.nodes).toHaveLength(3)
})

it('hideOrphans drops nodes whose edges are all hidden by the edge filter', async () => {
  const { result } = renderHook(() => useGraph(fakeClient(), 'g1', styles))
  await act(async () => { await result.current.reload() })
  act(() => {
    result.current.setVisibleEdgeTypes(new Set(['depends_on']))
    result.current.setHideOrphans(true)
  })
  expect(result.current.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
  act(() => { result.current.setHideOrphans(false) })
  expect(result.current.nodes).toHaveLength(3)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/graph/useGraph.test.tsx`
Expected: FAIL — `edgeTypes` undefined, `setVisibleEdgeTypes`/`setHideOrphans` not functions.

- [ ] **Step 3: Implement**

In `useGraph.ts`: type `allEdges` state as `Edge<TypedEdgeData>[]`; add state `visibleEdgeTypes` (`null`) and `hideOrphans` (`false`); derive `const edgeTypes = useMemo(() => [...new Set(allEdges.map((e) => e.data.edgeType))].sort(), [allEdges])`; call `filterFlow(allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans)`; extend the `UseGraph` interface and the returned object with the five names from the Interfaces block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/useGraph.test.tsx`
Expected: PASS (new + all existing cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/useGraph.ts frontend/src/graph/useGraph.test.tsx
git commit -m "feat(fe): useGraph exposes edgeTypes, visibleEdgeTypes, hideOrphans"
```

### Task 4: `GraphEditor` toolbar — edge panel, orphans toggle, drop «Add Task»

**Files:**
- Modify: `frontend/src/graph/GraphEditor.tsx`
- Test: `frontend/src/graph/GraphEditor.test.tsx`

**Interfaces:**
- Consumes: `TypeFilterPanel` with `testPrefix` (Task 2); `edgeTypes`, `visibleEdgeTypes`, `setVisibleEdgeTypes`, `hideOrphans`, `setHideOrphans` (Task 3).
- Produces: DOM — `data-testid="edge-type-filter"`, `data-testid="edge-type-<type>"`, `data-testid="hide-orphans"` toggle button with label «Скрыть сироты» and `aria-pressed`; no «Add Task» button.

- [ ] **Step 1: Write the failing tests**

Update `fakeClient()`: add node `{ id: 'n3', type: 'Task', properties: {} }` and `edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }]` (n3 is isolated; n1–n2 connected). Re-anchor the mount case and add:

```tsx
it('mounts, loads, and shows the toolbar and canvas', async () => {
  render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
  await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
  expect(screen.queryByText('Add Task')).not.toBeInTheDocument()
  expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  expect(screen.getByText('Save layout')).toBeInTheDocument()
})

it('renders the edge filter panel with a checkbox per edge type', async () => {
  render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
  await waitFor(() => expect(screen.getByTestId('edge-type-filter')).toBeInTheDocument())
  expect(screen.getByTestId('edge-type-depends_on')).toBeChecked()
})

it('unchecking an edge type hides its edges but not the endpoint nodes', async () => {
  render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
  await waitFor(() => expect(screen.getByText('depends_on')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('edge-type-depends_on'))
  await waitFor(() => expect(screen.queryByText('depends_on')).not.toBeInTheDocument())
  expect(screen.getByText('n1')).toBeInTheDocument()
  expect(screen.getByText('n2')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('edge-type-depends_on'))
  await waitFor(() => expect(screen.getByText('depends_on')).toBeInTheDocument())
})

it('hide-orphans toggle hides and shows isolated nodes', async () => {
  render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
  await waitFor(() => expect(screen.getByText('n3')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('hide-orphans'))
  expect(screen.getByTestId('hide-orphans')).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() => expect(screen.queryByText('n3')).not.toBeInTheDocument())
  expect(screen.getByText('n1')).toBeInTheDocument()
  expect(screen.getByText('n2')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('hide-orphans'))
  await waitFor(() => expect(screen.getByText('n3')).toBeInTheDocument())
})

it('layout load does not reset the edge filter or orphan toggle', async () => {
  const client = fakeClient()
  ;(client.getLayout as any).mockResolvedValue({
    id: 'l1', graphId: 'g1', name: 'default', positions: {}, viewport: { x: 0, y: 0, zoom: 1 },
  })
  ;(client.listLayouts as any).mockResolvedValue([{ id: 'l1', name: 'default' }])
  render(<GraphEditor client={client} graphId="g1" styles={{}} />)
  await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('edge-type-depends_on'))
  fireEvent.click(screen.getByTestId('hide-orphans'))
  fireEvent.click(screen.getByText('default'))
  await waitFor(() => expect(screen.getByTestId('type-Task')).toBeChecked())
  expect(screen.getByTestId('edge-type-depends_on')).not.toBeChecked()
  expect(screen.getByTestId('hide-orphans')).toHaveAttribute('aria-pressed', 'true')
})
```

If ReactFlow does not render the edge label text (`depends_on`) in jsdom, anchor the two edge-visibility cases on the orphan interplay instead: with «Скрыть сироты» active, unchecking `edge-type-depends_on` must make n1 and n2 disappear (they became orphans), re-checking brings them back.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/graph/GraphEditor.test.tsx`
Expected: FAIL — `edge-type-filter` missing, `hide-orphans` missing, `Add Task` still present.

- [ ] **Step 3: Implement**

In `GraphEditor.tsx`:
- Remove: the `Add Task` button, the whole `addNode` callback, the `notice` state and its `<span>` render, and now-unused imports (`commitMutation`, `newNodeMutation`).
- Destructure `edgeTypes, visibleEdgeTypes, setVisibleEdgeTypes, hideOrphans, setHideOrphans` from `useGraph`.
- After the existing node `TypeFilterPanel`, render the edge instance and the toggle:

```tsx
<TypeFilterPanel
  types={edgeTypes}
  visibleTypes={visibleEdgeTypes}
  styles={styles}
  onChange={setVisibleEdgeTypes}
  testPrefix="edge-type"
/>
<button
  onClick={() => setHideOrphans((v) => !v)}
  aria-pressed={hideOrphans}
  data-testid="hide-orphans"
  style={hideOrphans ? { background: '#d0d4da' } : undefined}
>
  Скрыть сироты
</button>
```

`onSaveLayout`/`onLoadLayout` bodies stay unchanged (spec: session state never persists).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/graph/GraphEditor.test.tsx`
Expected: PASS (new + remaining existing cases: type filter, save nodeTypes, hidden positions, load nodeTypes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/graph/GraphEditor.tsx frontend/src/graph/GraphEditor.test.tsx
git commit -m "feat(fe): edge-type filter panel, hide-orphans toggle; drop Add Task"
```

### Task 5: Full verification + knowledge-graph refresh

**Files:**
- Modify: `graphify-out/` (generated)

**Interfaces:**
- Consumes: everything above.

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
git commit -m "chore: refresh code knowledge graph (edge filter + hide orphans)"
```

Expected: commit succeeds; `git status` clean afterwards (except pre-existing unrelated changes, if any).
