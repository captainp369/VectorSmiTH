import { useEffect } from 'react'
import Toolbar, { addImageLayers } from './components/Toolbar'
import LayersPanel from './components/LayersPanel'
import Inspector from './components/Inspector'
import CanvasStage from './components/CanvasStage'
import PagesBar from './components/PagesBar'
import PromptBox from './components/PromptBox'
import { useEditor } from './store'

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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
