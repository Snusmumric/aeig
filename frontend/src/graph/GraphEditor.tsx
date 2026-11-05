import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../api/client'
import type { Layout } from '../api/types'
import { GraphCanvas } from './GraphCanvas'
import { LayoutBar } from './LayoutBar'
import { TypeFilterPanel } from './TypeFilterPanel'
import { useGraph } from './useGraph'
import { extractPositions } from './layout'
import type { TypeStyleMap } from './typeStyle'

export interface GraphEditorProps {
  client: ApiClient
  graphId: string
  styles: TypeStyleMap
}

export function GraphEditor({ client, graphId, styles }: GraphEditorProps) {
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
  } = useGraph(client, graphId, styles)
  const [layouts, setLayouts] = useState<Layout[]>([])

  const refreshLayouts = useCallback(async () => {
    setLayouts(await client.listLayouts(graphId))
  }, [client, graphId])

  useEffect(() => {
    void reload()
    void refreshLayouts()
  }, [reload, refreshLayouts])

  const onSaveLayout = useCallback(
    async (name: string) => {
      const nodeTypes = visibleTypes ? [...visibleTypes] : undefined
      await client.saveLayout(graphId, name, extractPositions(allNodes), { x: 0, y: 0, zoom: 1 }, nodeTypes)
      await refreshLayouts()
    },
    [client, graphId, allNodes, visibleTypes, refreshLayouts],
  )

  const onLoadLayout = useCallback(
    async (name: string) => {
      const l = await client.getLayout(graphId, name)
      setVisibleTypes(l.nodeTypes ? new Set(l.nodeTypes) : null)
      await reload(l.positions)
    },
    [client, graphId, reload, setVisibleTypes],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd' }}>
        <LayoutBar
          layouts={layouts}
          onSave={(n) => void onSaveLayout(n)}
          onLoad={(n) => void onLoadLayout(n)}
        />
        <TypeFilterPanel
          types={types}
          visibleTypes={visibleTypes}
          styles={styles}
          onChange={setVisibleTypes}
        />
        <TypeFilterPanel
          types={edgeTypes}
          visibleTypes={visibleEdgeTypes}
          styles={styles}
          onChange={setVisibleEdgeTypes}
          testPrefix="edge-type"
        />
        <button
          onClick={() => setHideOrphans((v) => !v)}
          aria-pressed={hideOrphans}
          data-testid="hide-orphans"
          style={hideOrphans ? { background: '#d0d4da' } : undefined}
        >
          Скрыть сироты
        </button>
        {error && <span style={{ color: 'red' }}>{error}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <GraphCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} />
      </div>
    </div>
  )
}
