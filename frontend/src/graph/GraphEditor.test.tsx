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
      ],
      edges: [],
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
    await waitFor(() => expect(screen.getByText('Add Task')).toBeInTheDocument())
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
    expect(screen.getByText('Save layout')).toBeInTheDocument()
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
})
