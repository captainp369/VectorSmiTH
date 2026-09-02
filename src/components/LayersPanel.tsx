import { useRef, useState } from 'react'
import { useEditor, useScene } from '../store'
import type { Layer } from '../types'
import { groupLabel } from '../types'

const TYPE_ICONS: Record<Layer['type'], string> = {
  image: '🖼',
  text: 'T',
  rect: '▭',
  circle: '◯',
  line: '╱',
  polygon: '⬠',
  star: '★',
}

/** One clickable unit of the tree: a group header, or a single layer. */
type Unit =
  | { kind: 'group'; groupId: string; members: Layer[] }
  | { kind: 'layer'; layer: Layer }

export default function LayersPanel() {
  const scene = useScene()
  const selection = useEditor((s) => s.selection)
  const editor = useEditor
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragIds, setDragIds] = useState<string[] | null>(null)
  /** Last unit clicked without shift — the anchor for range-select. */
  const anchor = useRef<number | null>(null)

  // Top of the panel = top of the z-stack.
  const ordered = [...scene.layers].reverse()

  // Collapse the flat layer list into group headers + loose layers.
  const units: Unit[] = []
  const seenGroups = new Set<string>()
  for (const l of ordered) {
    if (l.group) {
      if (seenGroups.has(l.group)) continue
      seenGroups.add(l.group)
      units.push({ kind: 'group', groupId: l.group, members: ordered.filter((m) => m.group === l.group) })
    } else {
      units.push({ kind: 'layer', layer: l })
    }
  }

  const unitIds = (u: Unit) => (u.kind === 'group' ? u.members.map((m) => m.id) : [u.layer.id])
  const indexOf = (id: string) => scene.layers.findIndex((l) => l.id === id)

  /** A group is open when the user opened it, or when only part of it is selected. */
  const isOpen = (u: Extract<Unit, { kind: 'group' }>) => {
    const sel = u.members.filter((m) => selection.includes(m.id)).length
    if (sel > 0 && sel < u.members.length) return true
    return !collapsed.has(u.groupId)
  }

  const toggleOpen = (groupId: string, open: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (open) next.add(groupId)
      else next.delete(groupId)
      return next
    })

  /** Click on a whole unit (group header or loose layer). */
  const clickUnit = (u: Unit, unitIndex: number, e: React.MouseEvent) => {
    const state = editor.getState()
    const meta = e.metaKey || e.ctrlKey
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = anchor.current < unitIndex ? [anchor.current, unitIndex] : [unitIndex, anchor.current]
      state.select(units.slice(a, b + 1).flatMap(unitIds), { exact: true })
      return
    }
    anchor.current = unitIndex
    const ids = unitIds(u)
    if (meta) {
      const sel = state.selection
      const allIn = ids.every((id) => sel.includes(id))
      state.select(allIn ? sel.filter((id) => !ids.includes(id)) : [...sel, ...ids.filter((id) => !sel.includes(id))], {
        exact: true,
      })
    } else {
      state.select(ids, { exact: true })
    }
  }

  /** Click a member row inside an open group — selects just that layer. */
  const clickMember = (layer: Layer, e: React.MouseEvent) => {
    const state = editor.getState()
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      const sel = state.selection
      state.select(sel.includes(layer.id) ? sel.filter((id) => id !== layer.id) : [...sel, layer.id], { exact: true })
      return
    }
    state.select([layer.id], { exact: true })
  }

  const onDropOn = (targetId: string) => {
    const ids = dragIds
    setDragIds(null)
    if (!ids || ids.includes(targetId)) return
    const targetIdx = indexOf(targetId)
    const before = scene.layers.slice(0, targetIdx).filter((l) => !ids.includes(l.id)).length
    if (ids.length === 1) editor.getState().moveLayer(ids[0], before)
    else editor.getState().moveLayers(ids, before)
  }

  const rowDragProps = (ids: string[], targetId: string) => ({
    draggable: renamingId === null && renamingGroup === null,
    onDragStart: (e: React.DragEvent) => {
      setDragIds(ids)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => setDragIds(null),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDropOn(targetId)
    },
  })

  const iconButtons = (ids: string[], visible: boolean, locked: boolean) => (
    <>
      <button
        className={`icon-btn ${visible ? '' : 'off'}`}
        title={visible ? 'Hide' : 'Show'}
        onClick={(e) => {
          e.stopPropagation()
          editor.getState().updateLayers(ids, { visible: !visible }, { touch: false })
        }}
      >
        {visible ? '👁' : '—'}
      </button>
      <button
        className={`icon-btn ${locked ? 'on' : ''}`}
        title={locked ? 'Unlock' : 'Lock'}
        onClick={(e) => {
          e.stopPropagation()
          editor.getState().updateLayers(ids, { locked: !locked }, { touch: false })
        }}
      >
        {locked ? '🔒' : '🔓'}
      </button>
    </>
  )

  const layerRow = (layer: Layer, inGroup: boolean) => (
    <div
      key={layer.id}
      className={`layer-row ${selection.includes(layer.id) ? 'selected' : ''} ${
        dragIds?.includes(layer.id) ? 'dragging' : ''
      } ${inGroup ? 'child' : ''}`}
      {...rowDragProps([layer.id], layer.id)}
      onClick={(e) => (inGroup ? clickMember(layer, e) : undefined)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setRenamingId(layer.id)
      }}
    >
      <span className="layer-icon">{TYPE_ICONS[layer.type]}</span>
      {renamingId === layer.id ? (
        <input
          autoFocus
          defaultValue={layer.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            editor.getState().updateLayer(layer.id, { name: e.target.value || layer.name })
            setRenamingId(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setRenamingId(null)
          }}
        />
      ) : (
        <span className="layer-name" title={layer.name}>{layer.name}</span>
      )}
      {iconButtons([layer.id], layer.visible, layer.locked)}
    </div>
  )

  return (
    <div className="panel layers-panel">
      <div className="panel-title">Layers</div>
      <div className="layers-list">
        {units.length === 0 && <div className="empty-hint">No layers yet.<br />Add one from the toolbar or ask the AI.</div>}
        {units.map((u, i) => {
          if (u.kind === 'layer') {
            return (
              <div key={u.layer.id} onClick={(e) => clickUnit(u, i, e)}>
                {layerRow(u.layer, false)}
              </div>
            )
          }
          const ids = u.members.map((m) => m.id)
          const open = isOpen(u)
          const allSelected = ids.every((id) => selection.includes(id))
          const someSelected = !allSelected && ids.some((id) => selection.includes(id))
          const anyVisible = u.members.some((m) => m.visible)
          const allLocked = u.members.every((m) => m.locked)
          return (
            <div key={u.groupId} className="group-block">
              <div
                className={`layer-row group-row ${allSelected ? 'selected' : ''} ${someSelected ? 'partial' : ''} ${
                  dragIds?.includes(ids[0]) ? 'dragging' : ''
                }`}
                {...rowDragProps(ids, ids[0])}
                onClick={(e) => clickUnit(u, i, e)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setRenamingGroup(u.groupId)
                }}
              >
                <button
                  className="disclosure"
                  title={open ? 'Collapse group' : 'Expand group'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleOpen(u.groupId, open)
                  }}
                >
                  {open ? '▾' : '▸'}
                </button>
                <span className="layer-icon">📁</span>
                {renamingGroup === u.groupId ? (
                  <input
                    autoFocus
                    defaultValue={groupLabel(scene, u.groupId)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      editor.getState().renameGroup(u.groupId, e.target.value)
                      setRenamingGroup(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setRenamingGroup(null)
                    }}
                  />
                ) : (
                  <span className="layer-name" title={groupLabel(scene, u.groupId)}>
                    {groupLabel(scene, u.groupId)}
                  </span>
                )}
                <span className="group-count">{u.members.length}</span>
                {iconButtons(ids, anyVisible, allLocked)}
              </div>
              {open && u.members.map((m) => layerRow(m, true))}
            </div>
          )
        })}
      </div>
      {selection.length === 1 && (
        <div className="layer-order-buttons">
          <button onClick={() => editor.getState().moveLayer(selection[0], scene.layers.length - 1)}>To front</button>
          <button onClick={() => editor.getState().moveLayer(selection[0], indexOf(selection[0]) + 1)}>Up</button>
          <button onClick={() => editor.getState().moveLayer(selection[0], Math.max(0, indexOf(selection[0]) - 1))}>Down</button>
          <button onClick={() => editor.getState().moveLayer(selection[0], 0)}>To back</button>
        </div>
      )}
    </div>
  )
}
