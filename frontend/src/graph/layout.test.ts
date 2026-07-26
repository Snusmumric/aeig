import { describe, it, expect } from 'vitest'
import { extractPositions } from './layout'
import type { Node } from '@xyflow/react'

describe('extractPositions', () => {
  it('maps node id to its position', () => {
    const nodes = [
      { id: 'a', position: { x: 1, y: 2 } },
      { id: 'b', position: { x: 3, y: 4 } },
    ] as Node[]
    expect(extractPositions(nodes)).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } })
  })
})
