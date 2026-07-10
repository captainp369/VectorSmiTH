import { useEffect, useRef, useState } from 'react'
import { getScene, nanoid, makeLayerName, useEditor, useScene } from '../store'
import type { Layer, Scene } from '../types'
import { CANVAS_PRESETS, defaultProject, migrateProject } from '../types'
import { uploadAsset } from '../sync'
import { downloadBlob, loadImage, projectWithInlinedAssets, renderRaster, renderSVG } from '../export'

function baseLayer(scene: Scene, name: string) {
  return {
    id: nanoid(8),
    name: makeLayerName(scene, name),
    x: Math.round(scene.width * 0.1),
    y: Math.round(scene.height * 0.1),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    touched: true,
  }
}

export async function addImageLayers(files: File[], at?: { x: number; y: number }) {
  const editor = useEditor.getState()
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const src = await uploadAsset(file)
    const img = await loadImage(src)
    const scene = getScene()
    const maxW = scene.width * 0.6
    const scale = Math.min(1, maxW / img.naturalWidth, (scene.height * 0.8) / img.naturalHeight)
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const layer: Layer = {
      ...baseLayer(scene, file.name.replace(/\.[^.]+$/, '')),
      type: 'image',
      src,
      width: w,
      height: h,
      x: Math.round(at ? at.x - w / 2 : (scene.width - w) / 2),
      y: Math.round(at ? at.y - h / 2 : (scene.height - h) / 2),
    }
    editor.addLayer(layer)
    useEditor.getState().select([layer.id])
  }
}

export default function Toolbar() {
  const scene = useScene()
  const pageCount = useEditor((s) => s.project.pages.length)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const editor = useEditor
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [shapeOpen, setShapeOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [w, setW] = useState(scene.width)
  const [h, setH] = useState(scene.height)
  const [scaleLayers, setScaleLayers] = useState(false)
  const [exportScale, setExportScale] = useState(1)
  const [busy, setBusy] = useState('')

  const closeAll = () => {
    setSizeOpen(false)
    setExportOpen(false)
    setShapeOpen(false)
  }

  // Any click that isn't inside a popover (or its trigger) collapses open menus.
  useEffect(() => {
    if (!sizeOpen && !exportOpen && !shapeOpen) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.popover-anchor')) closeAll()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [sizeOpen, exportOpen, shapeOpen])

  const addText = () => {
    const s = getScene()
    const layer: Layer = {
      ...baseLayer(s, 'Text'),
      type: 'text',
      text: 'Double-click to edit',
      fontFamily: 'Inter',
      fontSize: Math.round(s.height / 10),
      fontWeight: 'bold',
      fill: '#111111',
      align: 'left',
      lineHeight: 1.1,
      width: Math.round(s.width * 0.6),
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const addRect = () => {
    const s = getScene()
    const layer: Layer = {
      ...baseLayer(s, 'Rectangle'),
      type: 'rect',
      width: Math.round(s.width * 0.3),
      height: Math.round(s.height * 0.3),
      fill: { kind: 'solid', color: '#3b82f6' },
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const addCircle = () => {
    const s = getScene()
    const layer: Layer = {
      ...baseLayer(s, 'Circle'),
      type: 'circle',
      x: Math.round(s.width / 2),
      y: Math.round(s.height / 2),
      radius: Math.round(Math.min(s.width, s.height) * 0.15),
      fill: { kind: 'solid', color: '#f59e0b' },
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const addPolygon = (sides: number, name: string) => {
    const s = getScene()
    const layer: Layer = {
      ...baseLayer(s, name),
      type: 'polygon',
      x: Math.round(s.width / 2),
      y: Math.round(s.height / 2),
      sides,
      radius: Math.round(Math.min(s.width, s.height) * 0.15),
      fill: { kind: 'solid', color: '#10b981' },
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const addStar = () => {
    const s = getScene()
    const r = Math.round(Math.min(s.width, s.height) * 0.16)
    const layer: Layer = {
      ...baseLayer(s, 'Star'),
      type: 'star',
      x: Math.round(s.width / 2),
      y: Math.round(s.height / 2),
      numPoints: 5,
      innerRadius: Math.round(r * 0.45),
      outerRadius: r,
      fill: { kind: 'solid', color: '#fbbf24' },
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const addLine = () => {
    const s = getScene()
    const layer: Layer = {
      ...baseLayer(s, 'Line'),
      type: 'line',
      points: [0, 0, Math.round(s.width * 0.3), 0],
      stroke: '#111111',
      strokeWidth: 6,
    }
    editor.getState().addLayer(layer)
    editor.getState().select([layer.id])
  }

  const applyCanvasSize = (nw: number, nh: number) => {
    editor.getState().commit((s) => {
      if (!scaleLayers) return { ...s, width: nw, height: nh }
      const fx = nw / s.width
      const fy = nh / s.height
      const f = Math.min(fx, fy)
      return {
        ...s,
        width: nw,
        height: nh,
        layers: s.layers.map((l) => {
          const moved = { ...l, x: l.x * fx, y: l.y * fy }
          switch (moved.type) {
            case 'image':
            case 'rect':
              return { ...moved, width: moved.width * f, height: moved.height * f }
            case 'text':
              return { ...moved, width: moved.width * f, fontSize: moved.fontSize * f }
            case 'circle':
            case 'polygon':
              return { ...moved, radius: moved.radius * f }
            case 'star':
              return { ...moved, innerRadius: moved.innerRadius * f, outerRadius: moved.outerRadius * f }
            case 'line':
              return { ...moved, points: moved.points.map((p) => p * f) }
          }
        }),
      }
    })
    setSizeOpen(false)
  }

  const doExport = async (format: 'png' | 'jpeg' | 'svg', allPages = false) => {
    setBusy(allPages ? 'all' : format)
    try {
      const pages = allPages ? editor.getState().project.pages : [getScene()]
      for (let i = 0; i < pages.length; i++) {
        const s = pages[i]
        const blob =
          format === 'svg' ? await renderSVG(s) : await renderRaster(s, format, exportScale)
        const pageName = allPages ? `-${(s.name || `page-${i + 1}`).replace(/[^a-zA-Z0-9ก-๛_-]+/g, '_')}` : ''
        downloadBlob(blob, `vectorsmith${pageName}-${s.width}x${s.height}.${format === 'jpeg' ? 'jpg' : format}`)
        if (allPages && i < pages.length - 1) await new Promise((r) => setTimeout(r, 350))
      }
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`)
    } finally {
      setBusy('')
      setExportOpen(false)
    }
  }

  const saveProject = async () => {
    setBusy('save')
    try {
      const p = await projectWithInlinedAssets(editor.getState().project)
      downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), 'project.vectorsmith.json')
    } finally {
      setBusy('')
    }
  }

  const openProject = async (file: File) => {
    try {
      const project = migrateProject(JSON.parse(await file.text()))
      if (!project) throw new Error('bad file')
      editor.getState().replaceProject(project)
    } catch {
      alert('Not a valid VectorSmith project file.')
    }
  }

  return (
    <div className="toolbar">
      <span className="brand">VectorSmith</span>
      <div className="tb-group">
        <button onClick={addText} title="Add text">+ Text</button>
        <div className="popover-anchor">
          <button onClick={() => { const v = !shapeOpen; closeAll(); setShapeOpen(v) }} title="Add shape">+ Shape ▾</button>
          {shapeOpen && (
            <div className="popover" onClick={() => setShapeOpen(false)}>
              <button className="preset" onClick={addRect}>▭ Rectangle</button>
              <button className="preset" onClick={addCircle}>◯ Circle</button>
              <button className="preset" onClick={() => addPolygon(3, 'Triangle')}>△ Triangle</button>
              <button className="preset" onClick={() => addPolygon(6, 'Hexagon')}>⬡ Polygon</button>
              <button className="preset" onClick={addStar}>★ Star</button>
              <button className="preset" onClick={addLine}>╱ Line</button>
            </div>
          )}
        </div>
        <button onClick={() => fileInput.current?.click()} title="Add image">+ Image</button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addImageLayers(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
      </div>

      <div className="tb-group">
        <button disabled={!canUndo} onClick={() => editor.getState().undo()} title="Undo (⌘Z)">↩</button>
        <button disabled={!canRedo} onClick={() => editor.getState().redo()} title="Redo (⇧⌘Z)">↪</button>
      </div>

      <div className="tb-group popover-anchor">
        <button onClick={() => { const v = !sizeOpen; closeAll(); setW(scene.width); setH(scene.height); setSizeOpen(v) }}>
          {scene.width} × {scene.height}
        </button>
        {sizeOpen && (
          <div className="popover">
            <div className="popover-title">Canvas size</div>
            {CANVAS_PRESETS.map((p) => (
              <button key={p.name} className="preset" onClick={() => applyCanvasSize(p.width, p.height)}>
                {p.name} — {p.width}×{p.height}
              </button>
            ))}
            <div className="popover-row">
              <input type="number" value={w} min={16} onChange={(e) => setW(parseInt(e.target.value) || 16)} />
              ×
              <input type="number" value={h} min={16} onChange={(e) => setH(parseInt(e.target.value) || 16)} />
              <button onClick={() => applyCanvasSize(w, h)}>Apply</button>
            </div>
            <label className="popover-row">
              <input type="checkbox" checked={scaleLayers} onChange={(e) => setScaleLayers(e.target.checked)} />
              Scale layers to fit new size
            </label>
            <label className="popover-row">
              Background
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(scene.background) ? scene.background : '#ffffff'}
                onChange={(e) => editor.getState().commit((s) => ({ ...s, background: e.target.value }))}
              />
            </label>
          </div>
        )}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <button onClick={saveProject} disabled={busy === 'save'}>Save project</button>
        <button onClick={() => projectInput.current?.click()}>Open project</button>
        <input
          ref={projectInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) openProject(e.target.files[0])
            e.target.value = ''
          }}
        />
        <button
          onClick={() => {
            if (confirm('Start a new empty project? Current work stays in undo history.')) {
              editor.getState().replaceProject(defaultProject(scene.width, scene.height))
            }
          }}
        >
          New
        </button>
      </div>

      <div className="tb-group popover-anchor">
        <button className="primary" onClick={() => { const v = !exportOpen; closeAll(); setExportOpen(v) }}>Export</button>
        {exportOpen && (
          <div className="popover popover-right">
            <div className="popover-title">Export {scene.width}×{scene.height}</div>
            <label className="popover-row">
              Scale
              <select value={exportScale} onChange={(e) => setExportScale(parseFloat(e.target.value))}>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={3}>3×</option>
              </select>
            </label>
            <div className="popover-row">
              <button disabled={!!busy} onClick={() => doExport('png')}>{busy === 'png' ? '…' : 'PNG'}</button>
              <button disabled={!!busy} onClick={() => doExport('jpeg')}>{busy === 'jpeg' ? '…' : 'JPG'}</button>
              <button disabled={!!busy} onClick={() => doExport('svg')}>{busy === 'svg' ? '…' : 'SVG'}</button>
            </div>
            {pageCount > 1 && (
              <div className="popover-row">
                <button disabled={!!busy} onClick={() => doExport('png', true)}>
                  {busy === 'all' ? 'Exporting…' : `PNG — all ${pageCount} pages`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
