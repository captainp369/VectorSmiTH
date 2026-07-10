import { useState } from 'react'
import { useEditor } from '../store'
import type { Layer } from '../types'

const TYPE_ICONS: Record<Layer['type'], string> = {
  image: '🖼',
  text: 'T',
  rect: '▭',
  circle: '◯',
  line: '╱',
  polygon: '⬠',
  star: '★',
}

export default function LayersPanel() {
  const scene = useEditor((s) => s.scene)
  const selection = useEditor((s) => s.selection)
  const editor = useEditor
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // Top of the panel = top of the z-stack.
  const layers = [...scene.layers].reverse()

  const indexOf = (id: string) => scene.layers.findIndex((l) => l.id === id)

  return (
    <div className="panel layers-panel">
      <div className="panel-title">Layers</div>
      <div className="layers-list">
        {layers.length === 0 && <div className="empty-hint">No layers yet.<br />Add one from the toolbar or ask the AI.</div>}
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`layer-row ${selection.includes(layer.id) ? 'selected' : ''} ${dragId === layer.id ? 'dragging' : ''}`}
            draggable={renamingId !== layer.id}
            onDragStart={(e) => {
              setDragId(layer.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!dragId || dragId === layer.id) return
              editor.getState().moveLayer(dragId, indexOf(layer.id))
              setDragId(null)
            }}
            onClick={(e) => {
              if (e.shiftKey) editor.getState().toggleSelect(layer.id)
              else editor.getState().select([layer.id])
            }}
            onDoubleClick={() => setRenamingId(layer.id)}
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
            <button
              className={`icon-btn ${layer.visible ? '' : 'off'}`}
              title={layer.visible ? 'Hide' : 'Show'}
              onClick={(e) => {
                e.stopPropagation()
                editor.getState().updateLayer(layer.id, { visible: !layer.visible }, { touch: false })
              }}
            >
              {layer.visible ? '👁' : '—'}
            </button>
            <button
              className={`icon-btn ${layer.locked ? 'on' : ''}`}
              title={layer.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => {
                e.stopPropagation()
                editor.getState().updateLayer(layer.id, { locked: !layer.locked }, { touch: false })
              }}
            >
              {layer.locked ? '🔒' : '🔓'}
            </button>
          </div>
        ))}
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
