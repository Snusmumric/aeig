import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedNodeData } from './toFlow'
import { filterFlow } from './filterFlow'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  edges: Edge[]
  types: string[]
  visibleTypes: Set<string> | null
  setVisibleTypes: Dispatch<SetStateAction<Set<string> | null>>
  version: number
  error: string | null
  reload: (positions?: PositionMap) => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  setVersion: (v: number) => void
}

export function useGraph(client: ApiClient, graphId: string, styles: TypeStyleMap): UseGraph {
  const [allNodes, setAllNodes] = useState<Node<TypedNodeData>[]>([])
  const [allEdges, setAllEdges] = useState<Edge[]>([])
  const [visibleTypes, setVisibleTypes] = useState<Set<string> | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(
    async (positions?: PositionMap) => {
      try {
        const [graph, sg] = await Promise.all([client.getGraph(graphId), client.getSubgraph(graphId)])
        setVersion(graph.version)
        setAllNodes(toFlowNodes(sg, styles, positions))
        setAllEdges(toFlowEdges(sg, styles))
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load failed')
      }
    },
    [client, graphId, styles],
  )

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setAllNodes((nds) => applyNodeChanges(changes, nds) as Node<TypedNodeData>[])
  }, [])

  const { nodes, edges } = useMemo(() => filterFlow(allNodes, allEdges, visibleTypes), [allNodes, allEdges, visibleTypes])
  const types = useMemo(() => [...new Set(allNodes.map((n) => n.data.nodeType))].sort(), [allNodes])

  return { nodes, edges, types, visibleTypes, setVisibleTypes, version, error, reload, onNodesChange, setVersion }
}
