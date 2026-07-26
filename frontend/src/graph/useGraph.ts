import { useCallback, useState } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedNodeData } from './toFlow'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  edges: Edge[]
  version: number
  error: string | null
  reload: (positions?: PositionMap) => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  setVersion: (v: number) => void
}

export function useGraph(client: ApiClient, graphId: string, styles: TypeStyleMap): UseGraph {
  const [nodes, setNodes] = useState<Node<TypedNodeData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (positions?: PositionMap) => {
      try {
        const [graph, sg] = await Promise.all([
          client.getGraph(graphId),
          client.getSubgraph(graphId),
        ])
        setVersion(graph.version)
        setNodes(toFlowNodes(sg, styles, positions))
        setEdges(toFlowEdges(sg, styles))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    },
    [client, graphId, styles],
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Node<TypedNodeData>[])
  }, [])

  return { nodes, edges, version, error, reload, onNodesChange, setVersion }
}
