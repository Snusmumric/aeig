import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { GraphEditor } from './GraphEditor'
import type { ApiClient } from '../api/client'
import type { Visualization } from '../api/types'

function viz(overrides: Partial<Visualization> = {}): Visualization {
  return {
    id: 'v1',
    graphId: 'g1',
    name: 'quiet-harbor-42',
    positions: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    edgeTypes: null,
    hideOrphans: false,
    isDefault: true,
    createdAt: '',
    graphVersion: 0,
    ...overrides,
  }
}

function fakeClient(def: Partial<Visualization> = {}): ApiClient {
  return {
    getGraph: vi.fn().mockResolvedValue({ id: 'g1', name: 'g', version: 1, createdAt: '' }),
    getSubgraph: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }],
    }),
    getDefaultVisualization: vi.fn().mockResolvedValue(viz(def)),
    getVisualization: vi.fn().mockRejectedValue(new Error('not found')),
    saveVisualization: vi.fn().mockResolvedValue(viz()),
    createGraph: vi.fn(),
    applyMutations: vi.fn(),
  } as unknown as ApiClient
}

async function settle() {
  // flush the mount effect's promise chain (viz resolve + reload) under fake timers
  await act(async () => {})
}

describe('GraphEditor', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('mounts, loads, and shows the toolbar and canvas', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    expect(screen.queryByText('Add Task')).not.toBeInTheDocument()
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.queryByText('Save layout')).not.toBeInTheDocument()
    expect(screen.getByTestId('viz-badge')).toBeInTheDocument()
  })

  it('renders the edge filter panel with a checkbox per edge type', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('edge-type-filter')).toBeInTheDocument())
    expect(screen.getByTestId('edge-type-depends_on')).toBeChecked()
  })

  it('unchecking an edge type hides its edges but not the endpoint nodes', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByText('n1')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edge-type-depends_on'))
    // edge hidden, but endpoint nodes stay: the edge filter alone never hides nodes
    expect(screen.getByText('n1')).toBeInTheDocument()
    expect(screen.getByText('n2')).toBeInTheDocument()
    // proof the edge is really gone: with hide-orphans active n1/n2 became orphans and vanish
    fireEvent.click(screen.getByTestId('hide-orphans'))
    await waitFor(() => expect(screen.queryByText('n1')).not.toBeInTheDocument())
    expect(screen.queryByText('n2')).not.toBeInTheDocument()
    // re-check: the edge is back, n1/n2 are connected again
    fireEvent.click(screen.getByTestId('edge-type-depends_on'))
    await waitFor(() => expect(screen.getByText('n1')).toBeInTheDocument())
    expect(screen.getByText('n2')).toBeInTheDocument()
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

  it('renders the type filter panel with a checkbox per type', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    expect(screen.getByTestId('type-Task')).toBeChecked()
    expect(screen.getByTestId('type-Milestone')).toBeChecked()
  })

  it('unchecking a type hides its nodes', async () => {
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await waitFor(() => expect(screen.queryByText('n2')).not.toBeInTheDocument())
    expect(screen.getByText('n1')).toBeInTheDocument()
  })

  it('shift+pointerdown on a node is not canceled (box-selection interceptor off)', async () => {
    // ReactFlow's default selectionKeyCode='Shift' cancels pointerdown started on a node,
    // which in a real browser suppresses the compatibility mousedown — d3-drag never
    // starts and shift-drag-follow dies. selectionKeyCode={null} removes the interceptor.
    render(<GraphEditor client={fakeClient()} graphId="g1" styles={{}} />)
    await waitFor(() => expect(document.querySelector('.react-flow__node[data-id="n1"]')).not.toBeNull())
    const n1El = document.querySelector('.react-flow__node[data-id="n1"]') as HTMLElement
    // The interceptor arms on the Shift keydown (ReactFlow useKeyPress), not on the
    // pointer event's modifier flags — a real user holds the physical key down first.
    fireEvent.keyDown(document, { key: 'Shift', code: 'ShiftLeft', shiftKey: true })
    const pd = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 100,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      shiftKey: true,
    })
    n1El.dispatchEvent(pd)
    expect(pd.defaultPrevented).toBe(false)
  })
})

describe('GraphEditor — visualizations', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads the default visualization and applies its filters and positions', async () => {
    vi.useFakeTimers()
    // n4 (Task) + e2 keep n1 connected once the Milestone filter hides n2 —
    // otherwise hideOrphans would hide n1 too and the position assert below
    // could not see it.
    const client = fakeClient({
      nodeTypes: ['Task'],
      edgeTypes: null,
      hideOrphans: true,
      positions: { n1: { x: 5, y: 5 } },
    })
    ;(client.getSubgraph as any).mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
        { id: 'n4', type: 'Task', properties: {} },
      ],
      edges: [
        { id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} },
        { id: 'e2', type: 'depends_on', source: 'n1', target: 'n4', properties: {} },
      ],
    })
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    expect(client.getDefaultVisualization).toHaveBeenCalledWith('g1')
    expect(screen.getByTestId('type-Milestone')).not.toBeChecked()
    expect(screen.getByTestId('hide-orphans')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('viz-badge').textContent).toBe('quiet-harbor-42')
    const n1El = document.querySelector('.react-flow__node[data-id="n1"]') as HTMLElement
    expect(n1El).not.toBeNull()
    expect(n1El.style.transform.replace(/\s+/g, '')).toContain('translate(5px,5px)')
  })

  it('falls back to default when ?viz= name is unknown', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ name: 'fallback-9', isDefault: true })
    render(<GraphEditor client={client} graphId="g1" styles={{}} initialVizName="ghost" />)
    await settle()
    expect(client.getVisualization).toHaveBeenCalledWith('g1', 'ghost')
    expect(client.getDefaultVisualization).toHaveBeenCalledWith('g1')
    expect(screen.getByTestId('viz-badge').textContent).toBe('fallback-9')
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })

  it('autosaves dirty state every 10s and not when clean', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ viewport: { x: 10, y: 20, zoom: 2 } })
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    expect(client.saveVisualization).not.toHaveBeenCalled()
    // loading a visualization must NOT dirty the state: the onMove echo from
    // applying the saved viewport is programmatic, not user interaction
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).not.toHaveBeenCalled()
    // dirty: a filter change is one of the wrapped dirty sources
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[0]).toBe('g1')
    expect(args[1]).toBe('quiet-harbor-42')
    // full payload: positions of ALL nodes incl. the now-hidden n2 (extractPositions(allNodes))
    expect(Object.keys(args[2])).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']))
    expect(args[3]).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(args[4]).toEqual(['Task'])
    expect(args[5]).toBeUndefined()
    expect(args[6]).toBe(false)
    // clean: nothing changed since the successful save → no second PUT
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
  })

  it('failed autosave keeps dirty and retries next tick', async () => {
    vi.useFakeTimers()
    const client = fakeClient()
    ;(client.saveVisualization as any).mockRejectedValue(new Error('boom'))
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(2)
    expect(screen.getByText('autosave failed — retrying')).toBeInTheDocument()
  })

  it('never autosaves empty positions while the graph failed to load, and recovers', async () => {
    vi.useFakeTimers()
    const bad = fakeClient()
    ;(bad.getSubgraph as any).mockRejectedValue(new Error('db down'))
    const utils = render(<GraphEditor client={bad} graphId="g1" styles={{}} />)
    await settle()
    // the viz resolves but the subgraph fails: no nodes loaded — the state can
    // still go dirty (filter click), and the autosave must NOT PUT the empty
    // snapshot over the saved row
    fireEvent.click(screen.getByTestId('hide-orphans'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(bad.saveVisualization).not.toHaveBeenCalled()
    // the load recovers (client/effect re-run, subgraph now resolves) — the
    // preserved dirty flag must produce exactly one save, with the full node set
    const good = fakeClient()
    utils.rerender(<GraphEditor client={good} graphId="g1" styles={{}} />)
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(good.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (good.saveVisualization as any).mock.calls[0]
    expect(Object.keys(args[2])).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']))
  })

  it('saves [] (show none) distinctly from an inactive filter', async () => {
    vi.useFakeTimers()
    const client = fakeClient()
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    // «Ни одного» in both panels → empty Sets (not null) → payload must carry []
    const noneButtons = screen.getAllByText('Ни одного')
    fireEvent.click(noneButtons[0])
    fireEvent.click(noneButtons[1])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[4]).toEqual([])
    expect(args[5]).toEqual([])
  })

  it('a save that resolves after newer edits does not wipe the dirty flag', async () => {
    vi.useFakeTimers()
    const client = fakeClient()
    let resolveSave: (v: Visualization) => void = () => {}
    ;(client.saveVisualization as any).mockImplementation(
      () => new Promise<Visualization>((res) => (resolveSave = res)),
    )
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    // S0 dirty → PUT(S0) starts and stays in flight
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    expect((client.saveVisualization as any).mock.calls[0][6]).toBe(false) // S0: hideOrphans off
    // S1 happens while PUT(S0) is still in flight
    fireEvent.click(screen.getByTestId('hide-orphans'))
    // PUT(S0) resolves — S1 must survive it
    await act(async () => {
      resolveSave(viz())
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(2)
    expect((client.saveVisualization as any).mock.calls[1][6]).toBe(true) // S1: hideOrphans on
  })

  it('falls back to default and rewrites the dead ?viz= name in the URL', async () => {
    window.history.replaceState(null, '', '/?graph=g1&viz=ghost')
    vi.useFakeTimers()
    const client = fakeClient({ name: 'fallback-9' })
    const spy = vi.spyOn(window.history, 'replaceState')
    render(<GraphEditor client={client} graphId="g1" styles={{}} initialVizName="ghost" />)
    await settle()
    expect(client.getVisualization).toHaveBeenCalledWith('g1', 'ghost')
    expect(client.getDefaultVisualization).toHaveBeenCalledWith('g1')
    expect(spy).toHaveBeenCalledWith(null, '', '?graph=g1&viz=fallback-9')
  })

  it('wires viz name into the URL once resolved', async () => {
    window.history.replaceState(null, '', '/?graph=g1')
    vi.useFakeTimers()
    const client = fakeClient()
    const spy = vi.spyOn(window.history, 'replaceState')
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    expect(spy).toHaveBeenCalledWith(null, '', '?graph=g1&viz=quiet-harbor-42')
  })
})

describe('GraphEditor — visualization manifest', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // the …0003 acceptance shape in miniature: 3 saved positions, graph grew to 5
  function legacyDiffClient(def: Partial<Visualization> = {}) {
    const client = fakeClient({
      positions: { n1: { x: 10, y: 10 }, n2: { x: 20, y: 10 }, n3: { x: 30, y: 10 } },
      ...def,
    })
    ;(client.getSubgraph as any).mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
        { id: 'n4', type: 'Task', properties: {} },
        { id: 'n5', type: 'Task', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} }],
    })
    return client
  }

  const boundManifest = {
    graphVersion: 4,
    nodes: {
      n1: { type: 'Task', label: 'n1', x: 1, y: 2 },
      n2: { type: 'Milestone', label: 'n2', x: 3, y: 4 },
    },
    edges: { e1: { type: 'depends_on', source: 'n1', target: 'n2' } },
  }

  it('stale legacy viz shows diff bar with counts and highlighted additions visible by default', async () => {
    vi.useFakeTimers()
    render(<GraphEditor client={legacyDiffClient()} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.getByTestId('viz-diff-bar')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-added').textContent).toBe('Новое (2)')
    expect(screen.getByTestId('toggle-deleted').textContent).toBe('Удалённое (0)')
    // additions highlighted immediately (both toggles ON by default)
    const n4 = document.querySelector('.react-flow__node[data-id="n4"]') as HTMLElement
    expect(n4).not.toBeNull()
    expect(n4.classList.contains('added')).toBe(true)
    const n1 = document.querySelector('.react-flow__node[data-id="n1"]') as HTMLElement
    expect(n1.classList.contains('added')).toBe(false)
  })

  it('renders a ghost for a dead position key and the «Удалённое» toggle hides it', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ positions: { n1: { x: 1, y: 1 }, dead: { x: 99, y: 99 } } })
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    const ghost = document.querySelector('.react-flow__node[data-id="dead"]') as HTMLElement
    expect(ghost).not.toBeNull()
    expect(ghost.classList.contains('ghost')).toBe(true)
    expect(screen.getByText('dead')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-deleted').textContent).toBe('Удалённое (1)')
    fireEvent.click(screen.getByTestId('toggle-deleted'))
    expect(screen.getByTestId('toggle-deleted')).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.react-flow__node[data-id="dead"]')).toBeNull()
    fireEvent.click(screen.getByTestId('toggle-deleted'))
    expect(document.querySelector('.react-flow__node[data-id="dead"]')).not.toBeNull()
  })

  it('toggles hide and show the added layer', async () => {
    vi.useFakeTimers()
    render(<GraphEditor client={legacyDiffClient()} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.getByTestId('toggle-deleted')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('toggle-added')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('toggle-added'))
    expect(screen.getByTestId('toggle-added')).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.react-flow__node[data-id="n4"]')).toBeNull()
    expect(document.querySelector('.react-flow__node[data-id="n5"]')).toBeNull()
    // manifest members stay visible
    expect(document.querySelector('.react-flow__node[data-id="n1"]')).not.toBeNull()
    fireEvent.click(screen.getByTestId('toggle-added'))
    expect(document.querySelector('.react-flow__node[data-id="n4"]')).not.toBeNull()
  })

  it('save-as free name forks with binding carried', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ name: 'bound-1', ...boundManifest })
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('save-viz'))
    const input = screen.getByTestId('save-viz-input') as HTMLInputElement
    expect(input.value).toBe('bound-1')
    fireEvent.change(input, { target: { value: 'fork-1' } })
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    // existence probe for the new name happened and found nothing
    expect(client.getVisualization).toHaveBeenCalledWith('g1', 'fork-1')
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[1]).toBe('fork-1')
    // binding carried as-is: manifest fields equal to the loaded viz
    expect(args[7]).toEqual({
      graphVersion: 4,
      nodes: boundManifest.nodes,
      edges: boundManifest.edges,
    })
    // the editor switched to the fork
    expect(screen.getByTestId('viz-badge').textContent).toBe('fork-1')
    expect(new URLSearchParams(window.location.search).get('viz')).toBe('fork-1')
    expect(screen.queryByTestId('save-viz-input')).not.toBeInTheDocument()
  })

  it('plain save under the same name PUTs with the copied manifest', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ ...boundManifest })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('save-viz'))
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    // same name → no existence probe, no confirm
    expect(client.getVisualization).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[1]).toBe('quiet-harbor-42')
    expect(args[7]).toEqual({
      graphVersion: 4,
      nodes: boundManifest.nodes,
      edges: boundManifest.edges,
    })
  })

  it('save-as existing name confirms overwrite and PUTs on ok', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ ...boundManifest })
    ;(client.getVisualization as any).mockResolvedValue(viz({ name: 'busy' }))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('save-viz'))
    fireEvent.change(screen.getByTestId('save-viz-input'), { target: { value: 'busy' } })
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    expect(confirmSpy).toHaveBeenCalledWith('Перезаписать?')
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[1]).toBe('busy')
    expect(args[7]).toEqual({
      graphVersion: 4,
      nodes: boundManifest.nodes,
      edges: boundManifest.edges,
    })
  })

  it('save-as existing name cancelled does no PUT', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ ...boundManifest })
    ;(client.getVisualization as any).mockResolvedValue(viz({ name: 'busy' }))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('save-viz'))
    fireEvent.change(screen.getByTestId('save-viz-input'), { target: { value: 'busy' } })
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    expect(client.saveVisualization).not.toHaveBeenCalled()
    // cancelled → the form stays open for another try
    expect(screen.getByTestId('save-viz-input')).toBeInTheDocument()
  })

  it('autosave payload omits manifest fields', async () => {
    vi.useFakeTimers()
    const client = fakeClient({ ...boundManifest })
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[7]).toBeUndefined()
  })

  it('sync PUTs manifest := subgraph and version := current', async () => {
    vi.useFakeTimers()
    const client = fakeClient({
      positions: { n1: { x: 5, y: 5 }, n2: { x: 6, y: 6 }, n3: { x: 7, y: 7 }, dead: { x: 99, y: 99 } },
    })
    ;(client.getSubgraph as any).mockResolvedValue({
      nodes: [
        { id: 'n1', type: 'Task', properties: {} },
        { id: 'n2', type: 'Milestone', properties: {} },
        { id: 'n3', type: 'Task', properties: {} },
      ],
      edges: [
        { id: 'e1', type: 'depends_on', source: 'n1', target: 'n2', properties: {} },
        { id: 'e2', type: 'blocks', source: 'n2', target: 'n3', properties: {} },
      ],
    })
    // echo the PUT back so the editor's local binding adopts the synced manifest
    // (later 7-arg autosaves must not blow up the echo — manifest optional)
    ;(client.saveVisualization as any).mockImplementation(
      (_gid: string, name: string, positions: unknown, viewport: unknown, nodeTypes: unknown, edgeTypes: unknown, hideOrphans: unknown, manifest?: any) =>
        Promise.resolve(
          viz({
            name,
            positions: positions as Visualization['positions'],
            viewport: viewport as Visualization['viewport'],
            nodeTypes: nodeTypes as string[] | undefined,
            edgeTypes: edgeTypes as string[] | null | undefined,
            hideOrphans: hideOrphans as boolean,
            graphVersion: manifest?.graphVersion ?? 0,
            nodes: manifest?.nodes,
            edges: manifest?.edges,
          }),
        ),
    )
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    // legacy row: 1 dead position key → ghost → the bar is up
    expect(screen.getByTestId('viz-diff-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sync-viz'))
    await settle()
    expect(client.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (client.saveVisualization as any).mock.calls[0]
    expect(args[7]).toEqual({
      graphVersion: 1,
      nodes: {
        n1: { type: 'Task', label: 'n1', x: 5, y: 5 },
        n2: { type: 'Milestone', label: 'n2', x: 6, y: 6 },
        n3: { type: 'Task', label: 'n3', x: 7, y: 7 },
      },
      edges: {
        e1: { type: 'depends_on', source: 'n1', target: 'n2' },
        e2: { type: 'blocks', source: 'n2', target: 'n3' },
      },
    })
    // positions := current alive nodes — the dead key is pruned for good
    expect(args[2]).not.toHaveProperty('dead')
    // the diff cleared: manifest == graph after the binding refresh
    expect(screen.queryByTestId('viz-diff-bar')).not.toBeInTheDocument()
    // and a later autosave keeps the row pruned
    fireEvent.click(screen.getByTestId('type-Milestone'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    const later = (client.saveVisualization as any).mock.calls[1]
    expect(later[2]).not.toHaveProperty('dead')
  })

  it('sync refuses to run on a failed graph load and recovers', async () => {
    vi.useFakeTimers()
    // the viz row resolves (bound) but the subgraph fails: allNodes is empty,
    // version is 0 — the bound viz diffs as "everything deleted" and the bar
    // renders next to the red error. One sync click would PUT manifest
    // {nodes:{}, edges:{}}, graphVersion 0, positions {} — an irreversible
    // wipe. Sync must bail exactly like the autosave does.
    const bad = fakeClient({ ...boundManifest })
    ;(bad.getSubgraph as any).mockRejectedValue(new Error('db down'))
    const utils = render(<GraphEditor client={bad} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.getByText('db down')).toBeInTheDocument()
    expect(screen.getByTestId('viz-diff-bar')).toBeInTheDocument() // «Удалённое (3)»
    fireEvent.click(screen.getByTestId('sync-viz'))
    await settle()
    expect(bad.saveVisualization).not.toHaveBeenCalled()
    // recovery: a working client re-runs the load (subgraph resolves) — sync
    // now PUTs the manifest built from the REAL graph
    const good = fakeClient({ ...boundManifest })
    utils.rerender(<GraphEditor client={good} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.queryByText('db down')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sync-viz'))
    await settle()
    expect(good.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (good.saveVisualization as any).mock.calls[0]
    expect(args[7]).toEqual({
      graphVersion: 1,
      nodes: {
        n1: { type: 'Task', label: 'n1', x: 0, y: 0 },
        n2: { type: 'Milestone', label: 'n2', x: 200, y: 0 },
        n3: { type: 'Task', label: 'n3', x: 400, y: 0 },
      },
      edges: { e1: { type: 'depends_on', source: 'n1', target: 'n2' } },
    })
  })

  it('save form refuses the empty snapshot on a failed graph load and recovers', async () => {
    vi.useFakeTimers()
    // viz row resolves but the subgraph fails: allNodes is empty — a plain
    // save (SAME name → no confirm gate) would PUT positions {} and wipe the
    // row. The form must refuse exactly like autosave/beforeunload/sync.
    const bad = fakeClient({ ...boundManifest })
    ;(bad.getSubgraph as any).mockRejectedValue(new Error('db down'))
    const utils = render(<GraphEditor client={bad} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.getByText('db down')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('save-viz'))
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    expect(bad.saveVisualization).not.toHaveBeenCalled()
    // recovery: a working client re-runs the load — submitting now PUTs the
    // real snapshot (positions of the loaded graph, binding carried as-is)
    const good = fakeClient({ ...boundManifest })
    utils.rerender(<GraphEditor client={good} graphId="g1" styles={{}} />)
    await settle()
    expect(screen.queryByText('db down')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('save-viz'))
    fireEvent.click(screen.getByTestId('save-viz-ok'))
    await settle()
    expect(good.saveVisualization).toHaveBeenCalledTimes(1)
    const args = (good.saveVisualization as any).mock.calls[0]
    expect(args[1]).toBe('quiet-harbor-42')
    expect(Object.keys(args[2])).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']))
    expect(args[7]).toEqual({
      graphVersion: 4,
      nodes: boundManifest.nodes,
      edges: boundManifest.edges,
    })
  })

  it('sync failure notice does not promise an automatic retry', async () => {
    vi.useFakeTimers()
    const client = legacyDiffClient()
    ;(client.saveVisualization as any).mockRejectedValue(new Error('boom'))
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await settle()
    fireEvent.click(screen.getByTestId('sync-viz'))
    await settle()
    // sync is a one-shot user action — unlike autosave it never retries itself
    expect(screen.getByText('sync failed')).toBeInTheDocument()
    expect(screen.queryByText('sync failed — retrying')).not.toBeInTheDocument()
  })
})
