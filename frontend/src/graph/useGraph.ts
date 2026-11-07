import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { applyNodeChanges, type Edge, type Node, type NodeChange, type OnNodeDrag } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import { toFlowEdges, toFlowNodes, type TypedEdgeData, type TypedNodeData } from './toFlow'
import { filterFlow } from './filterFlow'
import { applyFollowDrag, planFollowers } from './followDrag'
import { EST_CENTER, pickHandles } from './edgeGeometry'
import type { TypeStyleMap } from './typeStyle'

export type PositionMap = Record<string, { x: number; y: number }>

export interface UseGraph {
  nodes: Node<TypedNodeData>[]
  allNodes: Node<TypedNodeData>[]
  edges: Edge<TypedEdgeData>[]
  /** unfiltered edge set (manifest sync builds from these) */
  allEdges: Edge<TypedEdgeData>[]
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
  onNodeDragStart: OnNodeDrag
  onNodeDrag: OnNodeDrag
  onNodeDragStop: OnNodeDrag
  setVersion: (v: number) => void
}

interface DragSession {
  draggedId: string
  starts: Record<string, { x: number; y: number }>
  plan: Map<string, number>
}

function shiftOf(event: Parameters<OnNodeDrag>[0]): boolean {
  return 'shiftKey' in event && event.shiftKey === true
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

  const { nodes, edges } = useMemo(() => {
    const filtered = filterFlow(allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans)
    // dynamic side anchors: direction between estimated centers (position +
    // EST_CENTER) picks the facing handle pair; allNodes is a dependency, so
    // moving a node re-anchors the edge live
    const posById = new Map(allNodes.map((n) => [n.id, n.position]))
    const anchored = filtered.edges.map((edge) => {
      const sp = posById.get(edge.source)
      const tp = posById.get(edge.target)
      if (!sp || !tp) return edge
      const selfLoop = edge.source === edge.target
      const handles = pickHandles(
        { x: sp.x + EST_CENTER.x, y: sp.y + EST_CENTER.y },
        { x: tp.x + EST_CENTER.x, y: tp.y + EST_CENTER.y },
      )
      return {
        ...edge,
        sourceHandle: handles.source,
        targetHandle: handles.target,
        ...(selfLoop && edge.data !== undefined ? { data: { ...edge.data, selfLoop: true } } : {}),
      }
    })
    return { nodes: filtered.nodes, edges: anchored }
  }, [allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans])
  const types = useMemo(() => [...new Set(allNodes.map((n) => n.data.nodeType))].sort(), [allNodes])
  const edgeTypes = useMemo(
    () =>
      [...new Set(allEdges.map((e) => e.data?.edgeType).filter((t): t is string => t !== undefined))].sort(),
    [allEdges],
  )

  const dragSession = useRef<DragSession | null>(null)

  const onNodeDragStart = useCallback<OnNodeDrag>(
    (event, draggedNode) => {
      const selectedCount = nodes.filter((n) => n.selected).length
      if (!shiftOf(event) || selectedCount > 1) {
        dragSession.current = null
        return
      }
      const starts: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) starts[n.id] = { ...n.position }
      dragSession.current = {
        draggedId: draggedNode.id,
        starts,
        plan: planFollowers(nodes, edges, draggedNode.id),
      }
    },
    [nodes, edges],
  )

  const onNodeDrag = useCallback<OnNodeDrag>((_event, draggedNode) => {
    const session = dragSession.current
    if (!session || session.draggedId !== draggedNode.id) return
    const start = session.starts[draggedNode.id]
    if (!start) return
    const delta = { x: draggedNode.position.x - start.x, y: draggedNode.position.y - start.y }
    const next = applyFollowDrag(session.starts, session.plan, delta)
    setAllNodes((nds) => nds.map((n) => (next[n.id] ? { ...n, position: next[n.id] } : n)))
  }, [])

  const onNodeDragStop = useCallback<OnNodeDrag>(() => {
    dragSession.current = null
  }, [])

  return {
    nodes,
    allNodes,
    edges,
    allEdges,
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
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    setVersion,
  }
}
