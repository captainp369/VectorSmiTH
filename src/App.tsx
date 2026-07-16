import { useEffect } from 'react'
import Toolbar, { addImageLayers } from './components/Toolbar'
import LayersPanel from './components/LayersPanel'
import Inspector from './components/Inspector'
import CanvasStage from './components/CanvasStage'
import PagesBar from './components/PagesBar'
import PromptBox from './components/PromptBox'
import { getScene, makeLayerName, nanoid, useEditor } from './store'
import type { TextLayer } from './types'

function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  )
}

export default function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const editor = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (editor.selection.length) editor.duplicateLayers(editor.selection)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selection.length) {
        e.preventDefault()
        editor.removeLayers(editor.selection)
        return
      }
      if (e.key === 'Escape') {
        if (editor.croppingId) editor.setCropping(null)
        else editor.select([])
        return
      }
      if (e.key.startsWith('Arrow') && editor.selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        editor.commit((s) => ({
          ...s,
          layers: s.layers.map((l) =>
            editor.selection.includes(l.id) ? { ...l, x: l.x + dx, y: l.y + dy, touched: true } : l,
          ),
        }))
      }
    }
    // Copy/cut/paste go through the real clipboard events so they also work
    // from the browser's Edit menu, and layers round-trip via the OS clipboard.
    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (isTypingTarget(e.target)) return
      if (window.getSelection()?.toString()) return // user is copying page text
      const editor = useEditor.getState()
      if (!editor.selection.length) return
      const serial = editor.copyLayers(editor.selection)
      if (!serial) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', serial)
      if (cut) editor.removeLayers(editor.selection)
    }
    const onCut = (e: ClipboardEvent) => onCopy(e, true)

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return
      const editor = useEditor.getState()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text && editor.pasteExternal(text)) {
        e.preventDefault()
        return
      }
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (files.length) {
        e.preventDefault()
        addImageLayers(files)
        return
      }
      if (text.trim()) {
        e.preventDefault()
        const scene = getScene()
        const layer: TextLayer = {
          id: nanoid(8),
          name: makeLayerName(scene, 'Pasted text'),
          x: Math.round(scene.width * 0.1),
          y: Math.round(scene.height * 0.4),
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          touched: true,
          type: 'text',
          text: text.trim(),
          fontFamily: 'Inter',
          fontSize: Math.round(scene.height / 12),
          fontWeight: 'bold',
          fill: '#111111',
          align: 'left',
          lineHeight: 1.2,
          width: Math.round(scene.width * 0.8),
        }
        editor.addLayer(layer)
        editor.select([layer.id])
      }
    }

    window.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
        if (files.length) {
          e.preventDefault()
          addImageLayers(files)
        }
      }}
    >
      <Toolbar />
      <div className="main-row">
        <LayersPanel />
        <CanvasStage />
        <Inspector />
      </div>
      <PagesBar />
      <PromptBox />
    </div>
  )
}
