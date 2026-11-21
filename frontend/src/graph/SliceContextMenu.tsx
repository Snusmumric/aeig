import { useEffect, useRef, useState } from 'react'
import type { Slice } from '../api/types'

export interface SliceContextMenuProps {
  /** cursor coordinates (pageX/pageY of the contextMenu event) */
  x: number
  y: number
  slices: Slice[]
  /** node mode: the node's current memberships (slice ids) — shows checkmarks */
  memberships?: string[]
  /** edge mode: slices both of whose endpoints are already members */
  disabledSlices?: Set<string>
  /** node mode: toggle the slice membership; edge mode: add both endpoints */
  onToggle: (sliceId: string) => void
  /** node mode only: create a slice and add the node */
  onCreateNew: (name: string) => void
  onClose: () => void
}

/** Context menu on right-click of a node (membership checkboxes + «новый
 *  срез…») or an edge (add both endpoints, disabled when both are members).
 *  A plain DOM overlay at the cursor — our own listeners, jsdom-testable.
 *  Closes on Escape, click-outside and scroll. */
export function SliceContextMenu({
  x,
  y,
  slices,
  memberships,
  disabledSlices,
  onToggle,
  onCreateNew,
  onClose,
}: SliceContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const nodeMode = memberships !== undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onScroll = () => onClose()
    document.addEventListener('keydown', onKey)
    // capture phase: clicks on the canvas are swallowed by d3-drag (nodes) and
    // d3-zoom (pane), which stopPropagation() on mousedown — the bubble phase
    // never reaches document. Capture runs top-down before those listeners.
    document.addEventListener('mousedown', onPointer, true)
    // capture: element scroll events do not bubble, but still traverse the
    // capture phase — any scroll in the pane closes the menu
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const submitNew = () => {
    const name = newName.trim()
    if (!name) return // blank rejected client-side
    onCreateNew(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <div ref={ref} className="slice-context-menu" data-testid="slice-context-menu" style={{ left: x, top: y }}>
      {slices.length === 0 && <div className="slice-menu-empty">Нет срезов</div>}
      {slices.map((s) => {
        const disabled = !nodeMode && disabledSlices?.has(s.id) === true
        return (
          <div key={s.id} data-testid={`slice-menu-row-${s.id}`} className="slice-menu-row">
            {nodeMode ? (
              <label>
                <input
                  type="checkbox"
                  data-testid={`slice-menu-check-${s.id}`}
                  checked={memberships!.includes(s.id)}
                  onChange={() => onToggle(s.id)}
                />
                {s.name}
              </label>
            ) : (
              <button
                data-testid={`slice-menu-add-${s.id}`}
                disabled={disabled}
                title={disabled ? 'Оба конца уже в срезе' : undefined}
                onClick={() => onToggle(s.id)}
              >
                {s.name}
              </button>
            )}
          </div>
        )
      })}
      {nodeMode &&
        (creating ? (
          <span className="slice-menu-new" data-testid="slice-menu-new-form">
            <input
              data-testid="slice-menu-new-name"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitNew()
                }
              }}
            />
            <button data-testid="slice-menu-new-ok" onClick={submitNew}>
              ОК
            </button>
          </span>
        ) : (
          <button data-testid="slice-menu-new" onClick={() => setCreating(true)}>
            + новый срез…
          </button>
        ))}
    </div>
  )
}
