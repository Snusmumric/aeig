import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeChange } from '@xyflow/react'
import type { ApiClient } from '../api/client'
import type { Visualization, Viewport } from '../api/types'
import { GraphCanvas } from './GraphCanvas'
import { TypeFilterPanel } from './TypeFilterPanel'
import { useGraph } from './useGraph'
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
  const [applyViewport, setApplyViewport] = useState<Viewport | null>(null)
  const [fitView, setFitView] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const dirty = useRef(false)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })

  // Snapshot of the state the autosave needs — refreshed every render so the
  // 10s interval keeps a stable identity and never resets mid-session.
  const latest = useRef({ allNodes, visibleTypes, visibleEdgeTypes, hideOrphans })
  useEffect(() => {
    latest.current = { allNodes, visibleTypes, visibleEdgeTypes, hideOrphans }
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
      setVizName(viz.name)
      setFitView(Object.keys(viz.positions).length === 0)
      viewportRef.current = viz.viewport
      setApplyViewport(viz.viewport)
      const params = new URLSearchParams(window.location.search)
      if (!params.has('viz')) {
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
      if (changes.some((c) => c.type === 'position')) dirty.current = true
      onNodesChange(changes)
    },
    [onNodesChange],
  )

  const changeVisibleTypes = useCallback(
    (next: Set<string> | null) => {
      dirty.current = true
      setVisibleTypes(next)
    },
    [setVisibleTypes],
  )

  const changeVisibleEdgeTypes = useCallback(
    (next: Set<string> | null) => {
      dirty.current = true
      setVisibleEdgeTypes(next)
    },
    [setVisibleEdgeTypes],
  )

  const toggleHideOrphans = useCallback(() => {
    dirty.current = true
    setHideOrphans((v) => !v)
  }, [setHideOrphans])

  const handleMove = useCallback((vp: Viewport) => {
    viewportRef.current = vp
    dirty.current = true
  }, [])

  // Autosave every 10s while dirty (last-write-wins PUT of the whole state) +
  // a best-effort save on tab close (the client's PUT is keepalive).
  useEffect(() => {
    if (!vizName) return
    const saveArgs = () => {
      const { allNodes: an, visibleTypes: vt, visibleEdgeTypes: vet, hideOrphans: ho } = latest.current
      const nodeTypes = vt?.size ? [...vt] : undefined
      const edgeTypes = vet?.size ? [...vet] : undefined
      return [graphId, vizName, extractPositions(an), viewportRef.current, nodeTypes, edgeTypes, ho] as const
    }
    const save = () => {
      if (!dirty.current) return
      void client
        .saveVisualization(...saveArgs())
        .then(() => {
          dirty.current = false
          setNotice(null)
        })
        .catch(() => setNotice('autosave failed — retrying'))
    }
    const onBeforeUnload = () => {
      if (dirty.current) void client.saveVisualization(...saveArgs())
    }
    const id = setInterval(save, AUTOSAVE_INTERVAL_MS)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [vizName, client, graphId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd' }}>
        {vizName && (
          <span
            data-testid="viz-badge"
            style={{ padding: '4px 8px', background: '#eef1f5', borderRadius: 4 }}
          >
            {vizName}
          </span>
        )}
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
        {error && <span style={{ color: 'red' }}>{error}</span>}
        {notice && <span style={{ color: '#b45309' }}>{notice}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
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
