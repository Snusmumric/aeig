import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { GraphEditor } from './GraphEditor'
import type { ApiClient } from '../api/client'

function fakeClient(): ApiClient {
  return {
    getGraph: vi.fn().mockResolvedValue({ id: 'g1', name: 'g', version: 1, createdAt: '' }),
    getSubgraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
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
})
