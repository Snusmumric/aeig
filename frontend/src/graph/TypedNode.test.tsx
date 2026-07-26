import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { TypedNode } from './TypedNode'

function renderNode(data: unknown) {
  return render(
    <ReactFlowProvider>
      <TypedNode {...({ data } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  )
}

describe('TypedNode', () => {
  it('renders label and type, applies ellipse shape', () => {
    renderNode({
      label: 'Hi',
      nodeType: 'Task',
      style: { shape: 'ellipse', color: '#ff0000' },
      properties: {},
    })
    const el = screen.getByTestId('typed-node')
    expect(el).toHaveAttribute('data-node-type', 'Task')
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(el).toHaveStyle({ borderRadius: '50%' })
  })
})
