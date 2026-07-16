import { useEffect, useRef } from 'react'
import { getScene, useEditor } from '../store'
import { loadImage } from '../export'
import type { ImageLayer, Layer } from '../types'

export interface MenuState {
  x: number
  y: number
}

/** Right-click menu for the canvas: clipboard, z-order, group, crop, lock. */
export default function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const editor = useEditor
  const selection = useEditor((s) => s.selection)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const scene = getScene()
  const selected = scene.layers.filter((l) => selection.includes(l.id))
  const singleImage = selected.length === 1 && selected[0].type === 'image' ? (selected[0] as ImageLayer) : null
  const anyGrouped = selected.some((l) => l.group)

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  const state = () => editor.getState()

  const copy = () => {
    const serial = state().copyLayers(state().selection)
    if (serial) navigator.clipboard?.writeText(serial).catch(() => undefined)
    return serial
  }
  const paste = () => {
    const p = navigator.clipboard?.readText?.()
    if (!p) {
      state().pasteLayers()
      return
    }
    p.then((t) => {
      if (!t || !state().pasteExternal(t)) state().pasteLayers()
    }).catch(() => state().pasteLayers())
  }
  const beginCrop = async (layer: ImageLayer) => {
    if (!layer.crop) {
      try {
        const img = await loadImage(layer.src)
        state().updateLayer(layer.id, {
          crop: { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight },
        } as Partial<Layer>)
      } catch {
        return
      }
    }
    state().select([layer.id], { exact: true })
    state().setCropping(layer.id)
  }

  const left = Math.min(menu.x, window.innerWidth - 210)
  const top = Math.min(menu.y, window.innerHeight - 320)

  return (
    <div className="context-menu" ref={ref} style={{ left, top }}>
      {selected.length > 0 && (
        <>
          <button onClick={run(copy)}>Copy <kbd>⌘C</kbd></button>
          <button
            onClick={run(() => {
              if (copy()) state().removeLayers(state().selection)
            })}
          >
            Cut <kbd>⌘X</kbd>
          </button>
        </>
      )}
      <button onClick={run(paste)}>Paste <kbd>⌘V</kbd></button>
      {selected.length > 0 && (
        <>
          <button onClick={run(() => state().duplicateLayers(state().selection))}>
            Duplicate <kbd>⌘D</kbd>
          </button>
          <button onClick={run(() => state().removeLayers(state().selection))}>
            Delete <kbd>⌫</kbd>
          </button>
          <hr />
          <button onClick={run(() => state().reorderLayers(state().selection, 'front'))}>
            Bring to front <kbd>⇧⌘]</kbd>
          </button>
          <button onClick={run(() => state().reorderLayers(state().selection, 'forward'))}>
            Bring forward <kbd>⌘]</kbd>
          </button>
          <button onClick={run(() => state().reorderLayers(state().selection, 'backward'))}>
            Send backward <kbd>⌘[</kbd>
          </button>
          <button onClick={run(() => state().reorderLayers(state().selection, 'back'))}>
            Send to back <kbd>⇧⌘[</kbd>
          </button>
          {(selected.length > 1 || anyGrouped || singleImage) && <hr />}
          {selected.length > 1 && (
            <button onClick={run(() => state().groupLayers(state().selection))}>
              Group <kbd>⌘G</kbd>
            </button>
          )}
          {anyGrouped && (
            <button onClick={run(() => state().ungroupLayers(state().selection))}>
              Ungroup <kbd>⇧⌘G</kbd>
            </button>
          )}
          {singleImage && (
            <button onClick={run(() => void beginCrop(singleImage))}>Crop image</button>
          )}
          <hr />
          <button
            onClick={run(() => {
              for (const l of selected) state().updateLayer(l.id, { locked: true })
              state().select([])
            })}
          >
            Lock
          </button>
        </>
      )}
      {selected.length === 0 && (
        <button
          onClick={run(() =>
            state().select(
              getScene()
                .layers.filter((l) => l.visible && !l.locked)
                .map((l) => l.id),
            ),
          )}
        >
          Select all <kbd>⌘A</kbd>
        </button>
      )}
    </div>
  )
}
