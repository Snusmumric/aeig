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
