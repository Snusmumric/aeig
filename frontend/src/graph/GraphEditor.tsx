import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '../api/client'
import type { Layout } from '../api/types'
import { GraphCanvas } from './GraphCanvas'
import { LayoutBar } from './LayoutBar'
import { useGraph } from './useGraph'
import { extractPositions } from './layout'
import { commitMutation, newNodeMutation } from './commit'
import type { TypeStyleMap } from './typeStyle'

export interface GraphEditorProps {
  client: ApiClient
  graphId: string
  styles: TypeStyleMap
}

export function GraphEditor({ client, graphId, styles }: GraphEditorProps) {
  const { nodes, edges, version, error, reload, onNodesChange, setVersion } = useGraph(
    client,
    graphId,
    styles,
  )
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const refreshLayouts = useCallback(async () => {
    setLayouts(await client.listLayouts(graphId))
  }, [client, graphId])

  useEffect(() => {
    void reload()
    void refreshLayouts()
  }, [reload, refreshLayouts])

  const addNode = useCallback(async () => {
    const res = await commitMutation(client, graphId, version, newNodeMutation('Task'))
    if (res.conflict) {
      setNotice('Someone else changed this graph — reloaded the latest version.')
    } else {
      setVersion(res.version)
      setNotice(null)
    }
    await reload(extractPositions(nodes))
  }, [client, graphId, version, nodes, reload, setVersion])

  const onSaveLayout = useCallback(
    async (name: string) => {
      await client.saveLayout(graphId, name, extractPositions(nodes), { x: 0, y: 0, zoom: 1 })
      await refreshLayouts()
    },
    [client, graphId, nodes, refreshLayouts],
  )

  const onLoadLayout = useCallback(
    async (name: string) => {
      const l = await client.getLayout(graphId, name)
      await reload(l.positions)
    },
    [client, graphId, reload],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ddd' }}>
        <button onClick={() => void addNode()}>Add Task</button>
        <LayoutBar
          layouts={layouts}
          onSave={(n) => void onSaveLayout(n)}
          onLoad={(n) => void onLoadLayout(n)}
        />
        {error && <span style={{ color: 'red' }}>{error}</span>}
        {notice && <span style={{ color: '#a60' }}>{notice}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <GraphCanvas nodes={nodes} edges={edges} onNodesChange={onNodesChange} />
      </div>
    </div>
  )
}
