import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, Node, NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import type { GraphEdge, GraphNode, Visualization, VisualizationManifest, Viewport } from '../api/types'
import { GraphCanvas } from './GraphCanvas'
import { TypeFilterPanel } from './TypeFilterPanel'
import { VizDiffBar } from './VizDiffBar'
import { useGraph } from './useGraph'
import { computeVizDiff } from './vizDiff'
import { extractPositions } from './layout'
import type { TypeStyleMap } from './typeStyle'

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
    types,
    visibleTypes,
    setVisibleTypes,
    edgeTypes,
    visibleEdgeTypes,
    setVisibleEdgeTypes,
    hideOrphans,
    setHideOrphans,
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
  const latest = useRef({ allNodes, visibleTypes, visibleEdgeTypes, hideOrphans, error })
  useEffect(() => {
    latest.current = { allNodes, visibleTypes, visibleEdgeTypes, hideOrphans, error }
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
      setHideOrphans(viz.hideOrphans)
      await reload(viz.positions)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, graphId, initialVizName, reload, setVisibleTypes, setVisibleEdgeTypes, setHideOrphans])

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
  const displayNodes = useMemo<Node[]>(() => {
    if (diff.mode === 'unbound') return nodes
    const alive = showAdded ? nodes : nodes.filter((n) => !diff.addedNodeIds.has(n.id))
    const styled = alive.map((n) => (diff.addedNodeIds.has(n.id) ? { ...n, className: 'added' } : n))
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
  }, [diff, nodes, graphNodes, showAdded, showDeleted])

  const displayEdges = useMemo<Edge[]>(() => {
    if (diff.mode === 'unbound') return edges
    const alive = showAdded ? edges : edges.filter((e) => !diff.addedEdgeIds.has(e.id))
    const styled = alive.map((e) =>
      diff.addedEdgeIds.has(e.id)
        ? { ...e, className: 'added', animated: true, style: { stroke: '#22c55e', strokeWidth: 2 } }
        : e,
    )
    if (!showDeleted) return styled
    const graphIds = new Set(graphEdges.map((e) => e.id))
    const ghosts = Object.entries(diff.manifestEdges)
      .filter(([id]) => !graphIds.has(id))
      .map(([id, m]) => ({
        id,
        source: m.source,
        target: m.target,
        label: m.type,
        className: 'ghost',
        style: { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 3' },
      }))
    return [...styled, ...ghosts]
  }, [diff, edges, graphEdges, showAdded, showDeleted])

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
        { manifest },
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
      const saved = await client.saveVisualization(...buildSaveArgs(name), { manifest: manifestOfViz() })
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
        .saveVisualization(...buildSaveArgs(vizName))
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
      if (dirty.current && !saveBlocked()) void client.saveVisualization(...buildSaveArgs(vizName))
    }
    const id = setInterval(save, AUTOSAVE_INTERVAL_MS)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [vizName, client, graphId, buildSaveArgs, saveBlocked])

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
      <div style={{ flex: 1 }}>
        <GraphCanvas
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={handleNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          applyViewport={applyViewport ?? undefined}
          onMove={handleMove}
          fitView={fitView}
        />
      </div>
    </div>
  )
}
