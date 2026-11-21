import { useState } from 'react'
import type { Slice } from '../api/types'

export interface SlicePanelProps {
  slices: Slice[]
  activeSliceId: string | null
  visibleSlices: Set<string> | null
  onActivate: (id: string) => void
  onCreate: (args: { name: string; description?: string }) => void
  onRename: (id: string, patch: { name?: string; description?: string }) => void
  onDelete: (id: string) => void
  onToggleVisible: (id: string) => void
  onSetAllVisible: () => void
  onSetNoneVisible: () => void
  onClose: () => void
  /** selected objects count (nodes + edges); 0 hides the bulk-add control */
  selectionCount?: number
  /** add the current selection to the picked slice (GraphEditor computes the id union) */
  onAddSelection?: (sliceId: string) => void
  /** «Только срез» view mode (ephemeral — dims/hides non-members of the
   *  active slice, composing AND with the persisted filters) */
  sliceOnly?: boolean
  onToggleSliceOnly?: () => void
  /** false while no visualization is loaded — the filter cannot persist */
  canFilter?: boolean
}

/** Overlay panel over the canvas: slice list (name/description/count),
 *  visibility checkboxes, inline rename, delete-with-confirm, create form.
 *  Plain DOM overlay — jsdom-testable, no d3. */
export function SlicePanel({
  slices,
  activeSliceId,
  visibleSlices,
  onActivate,
  onCreate,
  onRename,
  onDelete,
  onToggleVisible,
  onSetAllVisible,
  onSetNoneVisible,
  onClose,
  sliceOnly = false,
  onToggleSliceOnly,
  canFilter = true,
  selectionCount = 0,
  onAddSelection,
}: SlicePanelProps) {
  const [newName, setNewName] = useState('')
  const [addTarget, setAddTarget] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const isChecked = (id: string) => !visibleSlices || visibleSlices.has(id)

  const submitCreate = () => {
    const name = newName.trim()
    if (!name) return // blank rejected client-side
    onCreate({ name, ...(newDescription.trim() ? { description: newDescription.trim() } : {}) })
    setNewName('')
    setNewDescription('')
  }

  const startEdit = (s: Slice) => {
    setEditId(s.id)
    setEditName(s.name)
    setEditDescription(s.description)
  }

  const submitRename = (s: Slice) => {
    const name = editName.trim()
    if (!name || editId !== s.id) return
    onRename(s.id, { name, description: editDescription })
    setEditId(null)
  }

  const confirmDelete = (s: Slice) => {
    if (window.confirm(`Удалить срез «${s.name}»?`)) onDelete(s.id)
  }

  return (
    <div className="slice-panel" data-testid="slice-panel">
      <div className="slice-panel-head">
        <strong>Срезы</strong>
        <button data-testid="slice-panel-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <label className="slice-only-row">
        <input
          type="checkbox"
          data-testid="slice-only-toggle"
          checked={sliceOnly}
          disabled={activeSliceId === null || !onToggleSliceOnly}
          onChange={() => onToggleSliceOnly?.()}
        />
        Только срез
      </label>
      {slices.length === 0 && <div className="slice-empty">Срезов пока нет</div>}
      <ul className="slice-list">
        {slices.map((s) => (
          <li
            key={s.id}
            data-testid={`slice-row-${s.id}`}
            className={s.id === activeSliceId ? 'slice-row active' : 'slice-row'}
          >
            {editId === s.id ? (
              <span className="slice-edit" data-testid={`slice-edit-${s.id}`}>
                <input
                  data-testid={`slice-edit-name-${s.id}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <input
                  data-testid={`slice-edit-desc-${s.id}`}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <button data-testid={`slice-edit-ok-${s.id}`} onClick={() => submitRename(s)}>
                  ОК
                </button>
                <button data-testid={`slice-edit-cancel-${s.id}`} onClick={() => setEditId(null)}>
                  Отмена
                </button>
              </span>
            ) : (
              <>
                <input
                  type="checkbox"
                  data-testid={`slice-visible-${s.id}`}
                  checked={isChecked(s.id)}
                  disabled={!canFilter}
                  onChange={() => onToggleVisible(s.id)}
                />
                <span data-testid={`slice-name-${s.id}`} className="slice-name">
                  {s.name}
                </span>
                <span data-testid={`slice-count-${s.id}`} className="slice-count" title="участников">
                  {s.nodeCount}
                </span>
                {s.description && (
                  <span data-testid={`slice-desc-${s.id}`} className="slice-desc">
                    {s.description}
                  </span>
                )}
                <button data-testid={`slice-activate-${s.id}`} onClick={() => onActivate(s.id)}>
                  Показать
                </button>
                <button data-testid={`slice-rename-${s.id}`} onClick={() => startEdit(s)}>
                  Изменить
                </button>
                <button data-testid={`slice-delete-${s.id}`} onClick={() => confirmDelete(s)}>
                  Удалить
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="slice-filter-actions">
        <button data-testid="slice-visible-all" onClick={onSetAllVisible} disabled={!canFilter}>
          Все
        </button>
        <button data-testid="slice-visible-none" onClick={onSetNoneVisible} disabled={!canFilter}>
          Ни одного
        </button>
      </div>
      {selectionCount > 0 && onAddSelection && slices.length > 0 && (
        <div className="slice-add-selection" data-testid="slice-add-selection">
          Добавить выделенное (<span data-testid="add-selection-count">{selectionCount}</span>) в{' '}
          <select
            data-testid="add-selection-slice"
            value={addTarget || activeSliceId || slices[0].id}
            onChange={(e) => setAddTarget(e.target.value)}
          >
            {slices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>{' '}
          <button
            data-testid="add-selection-go"
            onClick={() => onAddSelection(addTarget || activeSliceId || slices[0].id)}
          >
            Добавить
          </button>
        </div>
      )}
      <div className="slice-create" data-testid="slice-create-form">
        <input
          data-testid="slice-create-name"
          placeholder="имя среза"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <input
          data-testid="slice-create-desc"
          placeholder="описание (необязательно)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <button data-testid="slice-create-ok" onClick={submitCreate}>
          Создать
        </button>
      </div>
    </div>
  )
}
