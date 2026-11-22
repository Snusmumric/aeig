import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { Edge, Node, NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import type { GraphEdge, GraphNode, Slice, Visualization, VisualizationManifest, Viewport } from '../api/types'
import { MarkerType } from '@xyflow/react'
import { GraphCanvas } from './GraphCanvas'
import { TypeFilterPanel } from './TypeFilterPanel'
import { SlicePanel } from './SlicePanel'
import { SliceContextMenu } from './SliceContextMenu'
import { VizDiffBar } from './VizDiffBar'
import { useGraph } from './useGraph'
import { computeVizDiff } from './vizDiff'
import { extractPositions } from './layout'
import { EST_CENTER, pickHandles, type Bend } from './edgeGeometry'
import { resolveStyle, type TypeStyleMap } from './typeStyle'

const AUTOSAVE_INTERVAL_MS = 10_000

export interface GraphEditorProps {
  client: ApiClient
  graphId: string
  styles: TypeStyleMap
  /** Visualization name from the URL (`?graph=<id>&viz=<name>`); absent → default. */
  initialVizName?: string
}

export function GraphEditor({ client, graphId, styles, initialVizName }: GraphEditorProps) {
  const {
    nodes,
    edges,
    allNodes,
    allEdges,
    version,
    error,
    reload,
    onNodesChange,
    onEdgesChange,
    types,
    visibleTypes,
    setVisibleTypes,
    edgeTypes,
    visibleEdgeTypes,
    setVisibleEdgeTypes,
    hideOrphans,
    setHideOrphans,
    visibleSlices,
    setVisibleSlices,
    bends,
    setBends,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useGraph(client, graphId, styles)

  const [vizName, setVizName] = useState<string | null>(null)
  /** the loaded visualization row — the binding is copied from it on saves */
  const [viz, setViz] = useState<Visualization | null>(null)
  const [applyViewport, setApplyViewport] = useState<Viewport | null>(null)
  const [fitView, setFitView] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  // diff layer visibility — both ON by default: the drift shows immediately
  const [showDeleted, setShowDeleted] = useState(true)
  const [showAdded, setShowAdded] = useState(true)
  const [saveFormOpen, setSaveFormOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  // slice management state: panel visibility, list, active slice, «Только срез»
  const [slicesOpen, setSlicesOpen] = useState(false)
  const [slices, setSlices] = useState<Slice[]>([])
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null)
  const [sliceOnly, setSliceOnly] = useState(false)
  // context menus: cursor position + the right-clicked element id
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null)
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)
  // bumped on every state change that dirties the editor — lets a save that was
  // in flight when newer edits happened refuse to declare the state clean
  const revision = useRef(0)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })

  const markDirty = useCallback(() => {
    revision.current += 1
    dirty.current = true
  }, [])

  // Snapshot of the state the autosave needs — refreshed every render so the
  // 10s interval keeps a stable identity and never resets mid-session.
  const latest = useRef({ allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans, visibleSlices, bends, error })
  useEffect(() => {
    latest.current = { allNodes, allEdges, visibleTypes, visibleEdgeTypes, hideOrphans, visibleSlices, bends, error }
  })

  // Mount: resolve the visualization — the ?viz= name, falling back to the
  // (auto-created) default — then apply its filters + positions and write the
  // resolved name back into the URL.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      let viz: Visualization | null = null
      if (initialVizName) {
        viz = await client.getVisualization(graphId, initialVizName).catch(() => null)
      }
      if (!viz) viz = await client.getDefaultVisualization(graphId).catch(() => null)
      if (cancelled) return
      if (!viz) {
        await reload()
        return
      }
      setViz(viz)
      setVizName(viz.name)
      setFitView(Object.keys(viz.positions).length === 0)
      viewportRef.current = viz.viewport
      setApplyViewport(viz.viewport)
      const params = new URLSearchParams(window.location.search)
      if (params.get('viz') !== viz.name) {
        // add the resolved name, or replace a dead ?viz= the fallback rescued us from
        params.set('viz', viz.name)
        window.history.replaceState(null, '', `?${params.toString()}`)
      }
      if (viz.nodeTypes) setVisibleTypes(new Set(viz.nodeTypes))
      else setVisibleTypes(null)
      if (viz.edgeTypes) setVisibleEdgeTypes(new Set(viz.edgeTypes))
      else setVisibleEdgeTypes(null)
      if (viz.visibleSlices) setVisibleSlices(new Set(viz.visibleSlices))
      else setVisibleSlices(null)
      setHideOrphans(viz.hideOrphans)
      setBends(viz.bends ?? {})
      await reload(viz.positions)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, graphId, initialVizName, reload, setVisibleTypes, setVisibleEdgeTypes, setVisibleSlices, setHideOrphans, setBends])

  // Dirty tracking: node position changes, filter changes, viewport moves.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (changes.some((c) => c.type === 'position')) markDirty()
      onNodesChange(changes)
    },
    [onNodesChange, markDirty],
  )

  const changeVisibleTypes = useCallback(
    (next: Set<string> | null) => {
      markDirty()
      setVisibleTypes(next)
    },
    [setVisibleTypes, markDirty],
  )

  const changeVisibleEdgeTypes = useCallback(
    (next: Set<string> | null) => {
      markDirty()
      setVisibleEdgeTypes(next)
    },
    [setVisibleEdgeTypes, markDirty],
  )

  const toggleHideOrphans = useCallback(() => {
    markDirty()
    setHideOrphans((v) => !v)
  }, [setHideOrphans, markDirty])

  // ── slices: list refresh, panel actions, visibility filter ────────────────
  const refreshSlices = useCallback(async () => {
    try {
      setSlices(await client.listSlices(graphId))
    } catch {
      // the panel keeps showing the previous list; failures are non-fatal
    }
  }, [client, graphId])

  const openSlices = useCallback(() => {
    setSlicesOpen(true)
    void refreshSlices()
  }, [refreshSlices])

  const activateSlice = useCallback((id: string) => {
    // toggle: clicking the already-active slice deactivates it
    setActiveSliceId((prev) => (prev === id ? null : id))
  }, [])

  const handleCreateSlice = useCallback(
    (args: { name: string; description?: string }) => {
      void client.createSlice(graphId, args).then(refreshSlices).catch(() => setNotice('slice create failed'))
    },
    [client, graphId, refreshSlices],
  )

  // rename is name-addressed — resolve the id to its CURRENT name first
  const handleRenameSlice = useCallback(
    (id: string, patch: { name?: string; description?: string }) => {
      const current = slices.find((s) => s.id === id)
      if (!current) return
      void client.renameSlice(graphId, current.name, patch).then(refreshSlices).catch(() => setNotice('slice rename failed'))
    },
    [client, graphId, slices, refreshSlices],
  )

  const handleDeleteSlice = useCallback(
    (id: string) => {
      const current = slices.find((s) => s.id === id)
      if (!current) return
      void client
        .deleteSlice(graphId, current.name)
        .then(() => {
          if (activeSliceId === id) {
            setActiveSliceId(null)
            setSliceOnly(false)
          }
          return refreshSlices()
        })
        .catch(() => setNotice('slice delete failed'))
    },
    [client, graphId, slices, activeSliceId, refreshSlices],
  )

  // current selection as id union: selected nodes + BOTH endpoints of selected
  // edges (the context-menu rule), deduped; riding allNodes/allEdges state
  const selectionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const n of allNodes) if (n.selected) ids.add(n.id)
    for (const e of allEdges) if (e.selected) {
      ids.add(e.source)
      ids.add(e.target)
    }
    return ids
  }, [allNodes, allEdges])
  const selectionCount = selectionIds.size

  const handleAddSelection = useCallback(
    (sliceId: string) => {
      const current = slices.find((s) => s.id === sliceId)
      if (!current || selectionIds.size === 0) return
      void client
        .addSliceNodes(graphId, current.name, [...selectionIds])
        .then(() => refreshSlices().then(() => reload(extractPositions(allNodes))))
        .catch(() => setNotice('slice add failed'))
    },
    [client, graphId, slices, selectionIds, refreshSlices, reload, allNodes],
  )

  // visibility filter — the TypeFilterPanel pattern: prune stale ids, toggle,
  // normalize «все отмечены» back to null (filter inactive)
  const toggleVisibleSlice = useCallback(
    (id: string) => {
      markDirty()
      const known = new Set(slices.map((s) => s.id))
      const next = new Set([...(visibleSlices ?? slices.map((s) => s.id))].filter((x) => known.has(x)))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setVisibleSlices(next.size === slices.length ? null : next)
    },
    [slices, visibleSlices, setVisibleSlices, markDirty],
  )

  const setAllSlicesVisible = useCallback(() => {
    markDirty()
    setVisibleSlices(null)
  }, [setVisibleSlices, markDirty])

  const setNoSlicesVisible = useCallback(() => {
    markDirty()
    setVisibleSlices(new Set())
  }, [setVisibleSlices, markDirty])

  // «Только срез» is an ephemeral view mode — never dirties the autosave
  const toggleSliceOnly = useCallback(() => {
    setSliceOnly((v) => !v)
  }, [])

  // ── slice context menus: membership ops on right-clicked elements ────────
  // membership changes must refetch the subgraph (fresh sliceIds) and the
  // slice list (fresh counts); positions are preserved across the reload
  const refetchMembership = useCallback(() => {
    const { allNodes: an } = latest.current
    void refreshSlices()
    void reload(extractPositions(an))
  }, [refreshSlices, reload])

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      event.preventDefault() // suppress the browser menu
      void refreshSlices()
      setNodeMenu({ x: event.pageX, y: event.pageY, nodeId: node.id })
    },
    [refreshSlices],
  )

  // Right-click on the multi-selection overlay (after box-selection) — open the
  // slice menu for the FIRST selected node (the overlay passes all selected nodes;
  // membership toggles operate per-node, so the user picks a representative node)
  const handleSelectionContextMenu = useCallback(
    (event: ReactMouseEvent, nodes: Node[]) => {
      event.preventDefault()
      void refreshSlices()
      if (nodes.length > 0) {
        setNodeMenu({ x: event.pageX, y: event.pageY, nodeId: nodes[0].id })
      }
    },
    [refreshSlices],
  )

  // Right-click on empty canvas WITH a selection — open a bulk-add-to-slice menu
  // (same union logic as the panel button: selected nodes + edge endpoints)
  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      if (selectionIds.size === 0) return // no selection → default browser menu
      event.preventDefault()
      void refreshSlices()
      const pageX = 'pageX' in event ? event.pageX : 0
      const pageY = 'pageY' in event ? event.pageY : 0
      setSelectionMenu({ x: pageX, y: pageY })
    },
    [selectionIds, refreshSlices],
  )

  const handleEdgeContextMenu = useCallback(
    (event: ReactMouseEvent, edge: Edge) => {
      event.preventDefault()
      void refreshSlices()
      setEdgeMenu({ x: event.pageX, y: event.pageY, edgeId: edge.id })
    },
    [refreshSlices],
  )

  const handleNodeMenuToggle = useCallback(
    (sliceId: string) => {
      const slice = slices.find((s) => s.id === sliceId)
      if (!slice || !nodeMenu) return
      const nodeId = nodeMenu.nodeId
      const isMember =
        allNodes.find((n) => n.id === nodeId)?.data.sliceIds?.includes(sliceId) ?? false
      const op = isMember
        ? client.removeSliceNodes(graphId, slice.name, [nodeId])
        : client.addSliceNodes(graphId, slice.name, [nodeId])
      void op.then(refetchMembership).catch(() => setNotice('slice update failed'))
    },
    [slices, nodeMenu, allNodes, client, graphId, refetchMembership],
  )

  const handleNodeMenuCreate = useCallback(
    (name: string) => {
      if (!nodeMenu) return
      void client
        .createSlice(graphId, { name, nodeIds: [nodeMenu.nodeId] })
        .then(refetchMembership)
        .catch(() => setNotice('slice create failed'))
    },
    [nodeMenu, client, graphId, refetchMembership],
  )

  // edge membership is derived: adding an edge = adding BOTH endpoints
  const edgeEndpoints = useMemo(() => {
    if (!edgeMenu) return []
    const edge = allEdges.find((e) => e.id === edgeMenu.edgeId)
    return edge ? [...new Set([edge.source, edge.target])] : []
  }, [edgeMenu, allEdges])

  const edgeDisabledSlices = useMemo(() => {
    const membersOf = (sid: string) =>
      new Set(allNodes.filter((n) => n.data.sliceIds?.includes(sid)).map((n) => n.id))
    return new Set(
      slices
        .filter((s) => {
          const members = membersOf(s.id)
          return edgeEndpoints.length > 0 && edgeEndpoints.every((id) => members.has(id))
        })
        .map((s) => s.id),
    )
  }, [slices, edgeEndpoints, allNodes])

  const handleEdgeMenuToggle = useCallback(
    (sliceId: string) => {
      const slice = slices.find((s) => s.id === sliceId)
      if (!slice || edgeEndpoints.length === 0) return
      void client
        .addSliceNodes(graphId, slice.name, edgeEndpoints)
        .then(refetchMembership)
        .catch(() => setNotice('slice update failed'))
    },
    [slices, edgeEndpoints, client, graphId, refetchMembership],
  )


  const handleMove = useCallback(
    (vp: Viewport) => {
      viewportRef.current = vp
      markDirty()
    },
    [markDirty],
  )

  // ── visualization binding: staleness diff + display layers ──────────────
  // computeVizDiff speaks API types — adapt the unfiltered flow arrays to it
  const graphNodes = useMemo<GraphNode[]>(
    () => allNodes.map((n) => ({ id: n.id, type: n.data.nodeType, properties: n.data.properties })),
    [allNodes],
  )
  const graphEdges = useMemo<GraphEdge[]>(
    () =>
      allEdges.map((e) => ({
        id: e.id,
        type: e.data?.edgeType ?? '',
        source: e.source,
        target: e.target,
        properties: {},
      })),
    [allEdges],
  )
  const diff = useMemo(() => computeVizDiff(viz, graphNodes, graphEdges), [viz, graphNodes, graphEdges])

  const deletedCount = diff.deletedNodes.length + diff.deletedEdges.length
  const addedCount = diff.addedNodeIds.size + diff.addedEdgeIds.size
  const hasDiff = deletedCount + addedCount > 0
  // stale with an empty diff (version bumped by property-only changes):
  // informational badge «v→v'», no toggles — sync still available
  const staleEmpty = !hasDiff && viz !== null && viz.graphVersion > 0 && viz.graphVersion < version

  // visible nodes = filtered graph nodes (additions highlighted while shown)
  // plus ghost nodes remembered by the manifest (bypass type filters)
  // «Только срез» (ephemeral view mode): keep only members of the active
  // slice, composing AND with the persisted filters; ghosts bypass it
  const activeMemberIds = useMemo(() => {
    if (activeSliceId === null) return null
    return new Set(allNodes.filter((n) => n.data.sliceIds?.includes(activeSliceId)).map((n) => n.id))
  }, [activeSliceId, allNodes])
  const sliceOnlyIds = sliceOnly ? activeMemberIds : null

  // active-slice markers: members get an outline; edges derived (both
  // endpoints members) a thicker stroke — applied after every filter
  const displayNodes = useMemo<Node[]>(() => {
    const markMembers = (list: Node[]) =>
      activeMemberIds
        ? list.map((n) =>
            activeMemberIds.has(n.id)
              ? { ...n, className: `${n.className ? `${n.className} ` : ''}slice-member` }
              : n,
          )
        : list
    const members = (list: Node[]) => (sliceOnlyIds ? list.filter((n) => sliceOnlyIds.has(n.id)) : list)
    if (diff.mode === 'unbound') return markMembers(members(nodes))
    const alive = showAdded ? nodes : nodes.filter((n) => !diff.addedNodeIds.has(n.id))
    const styled = markMembers(members(alive)).map((n) =>
      diff.addedNodeIds.has(n.id) ? { ...n, className: `${n.className ? `${n.className} ` : ''}added` } : n,
    )
    if (!showDeleted) return styled
    const graphIds = new Set(graphNodes.map((n) => n.id))
    const ghosts = Object.entries(diff.manifestNodes)
      .filter(([id]) => !graphIds.has(id))
      .map(([id, m]) => ({
        id,
        type: 'ghost',
        position: { x: m.x, y: m.y },
        draggable: false,
        deletable: false,
        data: { label: m.label },
        className: 'ghost',
      }))
    return [...styled, ...ghosts]
  }, [diff, nodes, graphNodes, showAdded, showDeleted, sliceOnlyIds, activeMemberIds])

  // anchor positions for ghost edges: current node positions first, then the
  // manifest's remembered coordinates for nodes gone from the graph
  const posById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    for (const n of allNodes) m.set(n.id, n.position)
    for (const [id, mn] of Object.entries(diff.manifestNodes)) {
      if (!m.has(id)) m.set(id, { x: mn.x, y: mn.y })
    }
    return m
  }, [allNodes, diff])

  const displayEdges = useMemo<Edge[]>(() => {
    // «Только срез»: an edge shows when BOTH endpoints are members —
    // the derived membership rule, applied to the already-filtered edges
    const members = (list: Edge[]) =>
      sliceOnlyIds ? list.filter((e) => sliceOnlyIds.has(e.source) && sliceOnlyIds.has(e.target)) : list
    // active-slice marker: both endpoints members → thicker stroke class
    const markEdges = (list: Edge[]) =>
      activeMemberIds
        ? list.map((e) =>
            activeMemberIds.has(e.source) && activeMemberIds.has(e.target)
              ? { ...e, className: `${e.className ? `${e.className} ` : ''}slice-member-edge` }
              : e,
          )
        : list
    if (diff.mode === 'unbound') return markEdges(members(edges))
    const alive = showAdded ? edges : edges.filter((e) => !diff.addedEdgeIds.has(e.id))
    const styled = markEdges(members(alive)).map((e) =>
      diff.addedEdgeIds.has(e.id)
        ? { ...e, className: `${e.className ? `${e.className} ` : ''}added`, animated: true, style: { stroke: '#22c55e', strokeWidth: 2 } }
        : e,
    )
    if (!showDeleted) return styled
    const graphIds = new Set(graphEdges.map((e) => e.id))
    const ghosts = Object.entries(diff.manifestEdges)
      .filter(([id]) => !graphIds.has(id))
      .map(([id, m]) => {
        const p1 = posById.get(m.source)
        const p2 = posById.get(m.target)
        const handles =
          p1 && p2
            ? pickHandles(
                { x: p1.x + EST_CENTER.x, y: p1.y + EST_CENTER.y },
                { x: p2.x + EST_CENTER.x, y: p2.y + EST_CENTER.y },
              )
            : null
        return {
          id,
          source: m.source,
          target: m.target,
          type: 'curvy',
          label: m.type,
          sourceHandle: handles?.source,
          targetHandle: handles?.target,
          className: 'ghost',
          style: { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 3' },
          ...(resolveStyle(styles, m.type).directed
            ? { markerEnd: { type: MarkerType.ArrowClosed } }
            : {}),
          data: { readOnly: true },
        }
      })
    return [...styled, ...ghosts]
  }, [diff, edges, graphEdges, showAdded, showDeleted, posById, styles, sliceOnlyIds, activeMemberIds])

  // the autosave PUT args — reads refs so its identity stays stable
  const buildSaveArgs = useCallback(
    (name: string) => {
      const { allNodes: an, visibleTypes: vt, visibleEdgeTypes: vet, hideOrphans: ho } = latest.current
      // an existing Set always serializes — even empty («Ни одного» = show none,
      // distinct from null = filter inactive)
      const nodeTypes = vt ? [...vt] : undefined
      const edgeTypes = vet ? [...vet] : undefined
      return [graphId, name, extractPositions(an), viewportRef.current, nodeTypes, edgeTypes, ho] as const
    },
    [graphId],
  )

  // the bends map for any save: current state filtered to live edge ids —
  // dead-edge bends (removed edges, reset drags dropping entries) vanish on
  // the next save (self-pruning full replace)
  const bendsForSave = useCallback(() => {
    const { bends: bs, allEdges: aes } = latest.current
    const live = new Set(aes.map((e) => e.id))
    return Object.fromEntries(Object.entries(bs).filter(([id]) => live.has(id)))
  }, [])

  // the slice filter for any save: full state, like bends — an existing Set
  // always serializes (even empty: «Ни одного» = show none); null («Все»)
  // PUTs explicit JSON null, clearing the stored column (absent = unchanged
  // would keep a stale subset alive across reloads)
  const visibleSlicesForSave = useCallback(() => {
    const { visibleSlices: vs } = latest.current
    return vs ? [...vs] : null
  }, [])

  // bend drags/resets dirty the editor exactly like filter changes
  const handleEdgeBend = useCallback(
    (edgeId: string, bend: Bend | null) => {
      markDirty()
      setBends((prev) => {
        if (bend === null) {
          if (!(edgeId in prev)) return prev
          const next = { ...prev }
          delete next[edgeId]
          return next
        }
        return { ...prev, [edgeId]: bend }
      })
    },
    [markDirty, setBends],
  )

  // binding as-is: only a bound row carries a manifest to copy; unbound/legacy
  // rows save without the manifest fields (server keeps them NULL → mode kept)
  const manifestOfViz = (): VisualizationManifest | undefined =>
    viz && viz.nodes != null
      ? { graphVersion: viz.graphVersion, nodes: viz.nodes ?? {}, edges: viz.edges ?? {} }
      : undefined

  // a failed or still-in-flight load means allNodes is empty — PUTting that
  // snapshot would wipe the saved row (positions and/or the manifest binding;
  // last-write-wins, no recovery); autosave AND sync must bail instead
  const saveBlocked = useCallback(() => {
    const { allNodes: an, error: err } = latest.current
    return err !== null || an.length === 0
  }, [])

  // «Синхронизировать» — the ONLY act that adopts the current graph: manifest
  // := current subgraph (all nodes/edges, unfiltered), graphVersion := current,
  // positions := current on-screen positions (dead ids pruned for good)
  const handleSync = () => {
    // viz row resolved but the graph load failed/stalled: the diff bar may
    // show "everything deleted" next to the load error — syncing the empty
    // snapshot would destroy the binding AND all saved positions
    if (!vizName || saveBlocked()) return
    const { visibleTypes: vt, visibleEdgeTypes: vet, hideOrphans: ho } = latest.current
    const manifest: VisualizationManifest = {
      graphVersion: version,
      nodes: Object.fromEntries(
        allNodes.map((n) => [
          n.id,
          { type: n.data.nodeType, label: n.data.label, x: n.position.x, y: n.position.y },
        ]),
      ),
      edges: Object.fromEntries(
        allEdges.map((e) => [e.id, { type: e.data?.edgeType ?? '', source: e.source, target: e.target }]),
      ),
    }
    const revAtSaveStart = revision.current
    void client
      .saveVisualization(
        graphId,
        vizName,
        extractPositions(allNodes),
        viewportRef.current,
        vt ? [...vt] : undefined,
        vet ? [...vet] : undefined,
        ho,
        { manifest, bends: bendsForSave(), visibleSlices: visibleSlicesForSave() },
      )
      .then((saved) => {
        setViz(saved)
        if (revision.current === revAtSaveStart) {
          dirty.current = false
          setNotice(null)
        }
      })
      .catch(() => setNotice('sync failed'))
  }

  // «Сохранить визуализацию» — fork / overwrite / plain save; every path carries
  // the binding as-is (copied from the loaded viz, never refreshed)
  const submitSaveForm = async () => {
    const name = saveName.trim()
    if (!name) return // blank rejected client-side
    // viz resolved but the graph load failed/stalled: the empty snapshot would
    // wipe the row's positions/viewport/filters — refuse like autosave/sync
    if (saveBlocked()) return
    if (name !== vizName) {
      const exists = await client.getVisualization(graphId, name).then(
        () => true,
        () => false,
      )
      if (exists && !window.confirm('Перезаписать?')) return
    }
    const revAtSaveStart = revision.current
    try {
      const saved = await client.saveVisualization(...buildSaveArgs(name), {
        manifest: manifestOfViz(),
        bends: bendsForSave(),
        visibleSlices: visibleSlicesForSave(),
      })
      if (revision.current === revAtSaveStart) {
        dirty.current = false
        setNotice(null)
      }
      setViz(saved)
      if (name !== vizName) {
        setVizName(name)
        const params = new URLSearchParams(window.location.search)
        params.set('viz', name)
        window.history.replaceState(null, '', `?${params.toString()}`)
      }
      setSaveFormOpen(false)
    } catch {
      setNotice('save failed — retrying')
    }
  }

  // Autosave every 10s while dirty (last-write-wins PUT of the whole state) +
  // a best-effort save on tab close (the client's PUT is keepalive).
  // Never sends the manifest fields — the binding refreshes only via sync.
  useEffect(() => {
    if (!vizName) return
    const save = () => {
      if (!dirty.current) return
      if (saveBlocked()) return
      const revAtSaveStart = revision.current
      void client
        .saveVisualization(...buildSaveArgs(vizName), {
          bends: bendsForSave(),
          visibleSlices: visibleSlicesForSave(),
        })
        .then(() => {
          // edits may have happened while this PUT was in flight — only declare
          // the state clean if nothing changed since the save started
          if (revision.current === revAtSaveStart) {
            dirty.current = false
            setNotice(null)
          }
        })
        .catch(() => setNotice('autosave failed — retrying'))
    }
    const onBeforeUnload = () => {
      if (dirty.current && !saveBlocked()) {
        void client.saveVisualization(...buildSaveArgs(vizName), {
          bends: bendsForSave(),
          visibleSlices: visibleSlicesForSave(),
        })
      }
    }
    const id = setInterval(save, AUTOSAVE_INTERVAL_MS)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [vizName, client, graphId, buildSaveArgs, bendsForSave, visibleSlicesForSave, saveBlocked])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd' }}>
        {saveFormOpen ? (
          <span data-testid="save-viz-form" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              data-testid="save-viz-input"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submitSaveForm()
                } else if (e.key === 'Escape') {
                  setSaveFormOpen(false)
                }
              }}
            />
            <button data-testid="save-viz-ok" onClick={() => void submitSaveForm()}>
              ОК
            </button>
            <button data-testid="save-viz-cancel" onClick={() => setSaveFormOpen(false)}>
              Отмена
            </button>
          </span>
        ) : (
          vizName && (
            <span
              data-testid="viz-badge"
              style={{ padding: '4px 8px', background: '#eef1f5', borderRadius: 4 }}
            >
              {vizName}
            </span>
          )
        )}
        <button data-testid="save-viz" onClick={() => { setSaveName(vizName ?? ''); setSaveFormOpen(true) }}>
          Сохранить визуализацию
        </button>
        <TypeFilterPanel
          types={types}
          visibleTypes={visibleTypes}
          styles={styles}
          onChange={changeVisibleTypes}
        />
        <TypeFilterPanel
          types={edgeTypes}
          visibleTypes={visibleEdgeTypes}
          styles={styles}
          onChange={changeVisibleEdgeTypes}
          testPrefix="edge-type"
        />
        <button
          onClick={toggleHideOrphans}
          aria-pressed={hideOrphans}
          data-testid="hide-orphans"
          style={hideOrphans ? { background: '#d0d4da' } : undefined}
        >
          Скрыть сироты
        </button>
        <button data-testid="slices-btn" onClick={slicesOpen ? () => setSlicesOpen(false) : openSlices}>
          Срезы
        </button>
        {hasDiff && (
          <VizDiffBar
            deletedCount={deletedCount}
            addedCount={addedCount}
            showDeleted={showDeleted}
            showAdded={showAdded}
            onToggleDeleted={() => setShowDeleted((v) => !v)}
            onToggleAdded={() => setShowAdded((v) => !v)}
            onSync={handleSync}
          />
        )}
        {staleEmpty && (
          <span data-testid="viz-stale-badge" style={{ display: 'flex', gap: 4, alignItems: 'center', color: '#b45309' }}>
            v{viz?.graphVersion}→v{version}
            <button data-testid="sync-viz" onClick={handleSync}>
              Синхронизировать
            </button>
          </span>
        )}
        {error && <span style={{ color: 'red' }}>{error}</span>}
        {notice && <span style={{ color: '#b45309' }}>{notice}</span>}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <GraphCanvas
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          applyViewport={applyViewport ?? undefined}
          onMove={handleMove}
          onEdgeBend={handleEdgeBend}
          onNodeContextMenu={handleNodeContextMenu}
          onSelectionContextMenu={handleSelectionContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          fitView={fitView}
        />
        {slicesOpen && (
          <SlicePanel
            slices={slices}
            activeSliceId={activeSliceId}
            visibleSlices={visibleSlices}
            onActivate={activateSlice}
            onCreate={handleCreateSlice}
            onRename={handleRenameSlice}
            onDelete={handleDeleteSlice}
            onToggleVisible={toggleVisibleSlice}
            onSetAllVisible={setAllSlicesVisible}
            onSetNoneVisible={setNoSlicesVisible}
            selectionCount={selectionCount}
            onAddSelection={handleAddSelection}
            onClose={() => setSlicesOpen(false)}
            sliceOnly={sliceOnly}
            onToggleSliceOnly={toggleSliceOnly}
            canFilter={vizName !== null}
          />
        )}
        {nodeMenu && (
          <SliceContextMenu
            x={nodeMenu.x}
            y={nodeMenu.y}
            slices={slices}
            memberships={allNodes.find((n) => n.id === nodeMenu.nodeId)?.data.sliceIds ?? []}
            onToggle={handleNodeMenuToggle}
            onCreateNew={handleNodeMenuCreate}
            onClose={() => setNodeMenu(null)}
          />
        )}
        {edgeMenu && (
          <SliceContextMenu
            x={edgeMenu.x}
            y={edgeMenu.y}
            slices={slices}
            disabledSlices={edgeDisabledSlices}
            onToggle={handleEdgeMenuToggle}
            onCreateNew={() => {}}
            onClose={() => setEdgeMenu(null)}
          />
        )}
        {selectionMenu && (
          <SliceContextMenu
            x={selectionMenu.x}
            y={selectionMenu.y}
            slices={slices}
            onToggle={(sliceId) => {
              handleAddSelection(sliceId)
              setSelectionMenu(null)
            }}
            onCreateNew={() => {}}
            onClose={() => setSelectionMenu(null)}
          />
        )}
      </div>
    </div>
  )
}
