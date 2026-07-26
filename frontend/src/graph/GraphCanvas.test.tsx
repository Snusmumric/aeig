import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'

describe('GraphCanvas', () => {
  it('mounts the canvas container without crashing', () => {
    render(<GraphCanvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument()
  })
})
