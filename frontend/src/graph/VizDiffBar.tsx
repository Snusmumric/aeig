export interface VizDiffBarProps {
  deletedCount: number
  addedCount: number
  showDeleted: boolean
  showAdded: boolean
  onToggleDeleted: () => void
  onToggleAdded: () => void
  onSync: () => void
}

/**
 * Staleness bar — rendered only when the visualization's remembered element
 * set drifted from the current graph (spec Goals 5). Both layer toggles are
 * pressed by default in the editor; they hide their layer when released.
 * «Синхронизировать» is the ONLY act that adopts the current graph.
 */
export function VizDiffBar({
  deletedCount,
  addedCount,
  showDeleted,
  showAdded,
  onToggleDeleted,
  onToggleAdded,
  onSync,
}: VizDiffBarProps) {
  return (
    <span
      data-testid="viz-diff-bar"
      style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 8px', background: '#fef3c7', borderRadius: 4 }}
    >
      <span>Граф изменилось: −{deletedCount} узлов/рёбер, +{addedCount}</span>
      <button data-testid="toggle-deleted" aria-pressed={showDeleted} onClick={onToggleDeleted}>
        Удалённое ({deletedCount})
      </button>
      <button data-testid="toggle-added" aria-pressed={showAdded} onClick={onToggleAdded}>
        Новое ({addedCount})
      </button>
      <button data-testid="sync-viz" onClick={onSync}>
        Синхронизировать
      </button>
    </span>
  )
}
