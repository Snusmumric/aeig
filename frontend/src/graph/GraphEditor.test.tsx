import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { GraphEditor } from './GraphEditor'
import type { ApiClient } from '../api/client'

function fakeClient(): ApiClient {
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
    listLayouts: vi.fn().mockResolvedValue([]),
    saveLayout: vi.fn(),
    getLayout: vi.fn(),
    createGraph: vi.fn(),
    applyMutations: vi.fn(),
  } as unknown as ApiClient
}

describe('GraphEditor', () => {
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

  it('saving a layout includes nodeTypes when the filter is active', async () => {
    const client = fakeClient()
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('type-Milestone'))
    fireEvent.click(screen.getByText('Save layout'))
    await waitFor(() => expect(client.saveLayout).toHaveBeenCalled())
    const args = (client.saveLayout as any).mock.calls[0]
    expect(args[4]).toEqual(['Task'])
  })

  it('saving with an active filter still persists hidden node positions', async () => {
    const client = fakeClient()
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByTestId('type-filter')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('type-Milestone'))
    fireEvent.click(screen.getByText('Save layout'))
    await waitFor(() => expect(client.saveLayout).toHaveBeenCalled())
    const args = (client.saveLayout as any).mock.calls[0]
    expect(Object.keys(args[2])).toEqual(expect.arrayContaining(['n1', 'n2']))
  })

  it('loading a layout applies its nodeTypes', async () => {
    const client = fakeClient()
    ;(client.getLayout as any).mockResolvedValue({
      id: 'l1', graphId: 'g1', name: 'default', positions: {}, viewport: { x: 0, y: 0, zoom: 1 },
      nodeTypes: ['Task'],
    })
    ;(client.listLayouts as any).mockResolvedValue([{ id: 'l1', name: 'default' }])
    render(<GraphEditor client={client} graphId="g1" styles={{}} />)
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument())
    fireEvent.click(screen.getByText('default'))
    await waitFor(() => expect(screen.queryByText('n2')).not.toBeInTheDocument())
    expect(screen.getByTestId('type-Milestone')).not.toBeChecked()
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
