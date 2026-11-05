import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedEdgeData, type TypedNodeData } from './toFlow'
import { filterFlow } from './filterFlow'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  allNodes: Node<TypedNodeData>[]
  edges: Edge<TypedEdgeData>[]
  types: string[]
  visibleTypes: Set<string> | null
  setVisibleTypes: Dispatch<SetStateAction<Set<string> | null>>
  edgeTypes: string[]
  visibleEdgeTypes: Set<string> | null
  setVisibleEdgeTypes: Dispatch<SetStateAction<Set<string> | null>>
  hideOrphans: boolean
  setHideOrphans: Dispatch<SetStateAction<boolean>>
  version: number
  error: string | null
  reload: (positions?: PositionMap) => Promise<void>
  onNodesChange: (changes: NodeChange[]) => void
  setVersion: (v: number) => void
}

export function useGraph(client: ApiClient, graphId: string, styles: TypeStyleMap): UseGraph {
  const [allNodes, setAllNodes] = useState<Node<TypedNodeData>[]>([])
  const [allEdges, setAllEdges] = useState<Edge<TypedEdgeData>[]>([])
  const [visibleTypes, setVisibleTypes] = useState<Set<string> | null>(null)
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string> | null>(null)
  const [hideOrphans, setHideOrphans] = useState(false)
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

  const { nodes, edges } = useMemo(
    () => filterFlow(allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans),
    [allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans],
  )
  const types = useMemo(() => [...new Set(allNodes.map((n) => n.data.nodeType))].sort(), [allNodes])
  const edgeTypes = useMemo(
    () =>
      [...new Set(allEdges.map((e) => e.data?.edgeType).filter((t): t is string => t !== undefined))].sort(),
    [allEdges],
  )

  return {
    nodes,
    allNodes,
    edges,
    types,
    visibleTypes,
    setVisibleTypes,
    edgeTypes,
    visibleEdgeTypes,
    setVisibleEdgeTypes,
    hideOrphans,
    setHideOrphans,
    version,
    error,
    reload,
    onNodesChange,
    setVersion,
  }
}
