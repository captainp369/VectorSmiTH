import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer as KLayer, Rect, Text, Circle, Line, Image as KImage, RegularPolygon, Star, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import { useEditor } from '../store'
import type { Layer, Scene, TextLayer } from '../types'
import { layerConfig } from '../konvaConfig'

const SNAP_SCREEN_PX = 6

interface Guides {
  v: number[]
  h: number[]
}

function snapValue(value: number, targets: number[], threshold: number): { value: number; line: number } | null {
  let best: { value: number; line: number; dist: number } | null = null
  for (const t of targets) {
    const dist = Math.abs(value - t)
    if (dist < threshold && (!best || dist < best.dist)) best = { value: t, line: t, dist }
  }
  return best
}

function LayerNode(props: {
  layer: Layer
  isEditing: boolean
  registerRef: (id: string, node: Konva.Node | null) => void
  onSelect: (e: KonvaEventObject<MouseEvent>) => void
  onDragStart: (e: KonvaEventObject<DragEvent>) => void
  onDragMove: (e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void
  onTransformEnd: () => void
  onDblClick: () => void
}) {
  const { layer, isEditing } = props
  const { cls, config } = layerConfig(layer)
  const [img] = useImage(layer.type === 'image' ? layer.src : '', 'anonymous')

  const common = {
    ...config,
    visible: layer.visible && !isEditing,
    draggable: !layer.locked,
    listening: layer.visible && !layer.locked,
    ref: (node: Konva.Node | null) => props.registerRef(layer.id, node),
    onClick: props.onSelect,
    onTap: props.onSelect,
    onDragStart: props.onDragStart,
    onDragMove: props.onDragMove,
    onDragEnd: props.onDragEnd,
    onTransformEnd: props.onTransformEnd,
    onDblClick: props.onDblClick,
    onDblTap: props.onDblClick,
  } as Record<string, unknown>

  switch (cls) {
    case 'Image':
      return <KImage {...common} image={img} />
    case 'Text':
      return <Text {...(common as any)} />
    case 'Rect':
      return <Rect {...(common as any)} />
    case 'Circle':
      return <Circle {...(common as any)} />
    case 'Line':
      return <Line {...(common as any)} />
    case 'RegularPolygon':
      return <RegularPolygon {...(common as any)} />
    case 'Star':
      return <Star {...(common as any)} />
    default:
      return null
  }
}

function TextEditOverlay({ layer, zoom, stage, onDone }: {
  layer: TextLayer
  zoom: number
  stage: Konva.Stage | null
  onDone: (text: string | null) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const node = stage?.findOne(`#${layer.id}`)
  const pos = node ? node.absolutePosition() : { x: layer.x * zoom, y: layer.y * zoom }

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <textarea
      ref={ref}
      defaultValue={layer.text}
      spellCheck={false}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: layer.width * zoom,
        minHeight: layer.fontSize * layer.lineHeight * zoom + 8,
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: 'top left',
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize * zoom,
        fontWeight: layer.fontWeight as any,
        lineHeight: String(layer.lineHeight),
        textAlign: layer.align,
        color: layer.fill,
        background: 'rgba(255,255,255,0.05)',
        border: '1px dashed #3b82f6',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        zIndex: 10,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onDone(e.currentTarget.value)
        } else if (e.key === 'Escape') {
          onDone(null)
        }
      }}
      onBlur={(e) => onDone(e.currentTarget.value)}
    />
  )
}

export default function CanvasStage() {
  const scene = useEditor((s) => s.scene)
  const selection = useEditor((s) => s.selection)
  const editingTextId = useEditor((s) => s.editingTextId)
  const editor = useEditor

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())
  const dragOrigins = useRef<Map<string, { x: number; y: number }> | null>(null)

  const [zoom, setZoomState] = useState(1)
  const [fontEpoch, setFontEpoch] = useState(0)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const userZoomed = useRef(false)
  const setZoom = (updater: number | ((z: number) => number)) => {
    userZoomed.current = true
    setZoomState(updater as never)
  }

  // Konva rasterizes text with whatever font is available at draw time; when a
  // web font finishes loading we remount text nodes (via key) to re-measure.
  useEffect(() => {
    const bump = () => setFontEpoch((e) => e + 1)
    document.fonts.ready.then(bump)
    document.fonts.addEventListener('loadingdone', bump)
    return () => document.fonts.removeEventListener('loadingdone', bump)
  }, [])
  useEffect(() => {
    for (const l of scene.layers) {
      if (l.type === 'text') {
        document.fonts
          .load(`${l.fontWeight === 'normal' ? '400' : l.fontWeight} 16px "${l.fontFamily}"`, l.text)
          .catch(() => {})
      }
    }
  }, [scene.layers])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fitZoom = useMemo(() => {
    if (!containerSize.w || !containerSize.h) return 1
    return Math.max(
      0.02,
      Math.min((containerSize.w - 32) / scene.width, (containerSize.h - 32) / scene.height, 1),
    )
  }, [containerSize, scene.width, scene.height])

  // Auto-fit until the user zooms manually; re-fit when canvas dimensions change.
  useEffect(() => {
    userZoomed.current = false
  }, [scene.width, scene.height])
  useEffect(() => {
    if (!userZoomed.current && containerSize.w > 0) setZoomState(fitZoom)
  }, [fitZoom, containerSize.w])

  // Attach transformer to the selected, unlocked, visible nodes.
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const nodes = selection
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => {
        if (!n) return false
        const l = scene.layers.find((x) => x.id === n.id())
        return !!l && !l.locked && l.visible && n.id() !== editingTextId
      })
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selection, scene.layers, editingTextId])

  const registerRef = (id: string, node: Konva.Node | null) => {
    if (node) nodeRefs.current.set(id, node)
    else nodeRefs.current.delete(id)
  }

  const handleSelect = (layer: Layer) => (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    if (e.evt.shiftKey) editor.getState().toggleSelect(layer.id)
    else if (!selection.includes(layer.id)) editor.getState().select([layer.id])
  }

  const handleDragStart = (layer: Layer) => (e: KonvaEventObject<DragEvent>) => {
    editor.getState().checkpoint()
    let sel = editor.getState().selection
    if (!sel.includes(layer.id)) {
      sel = [layer.id]
      editor.getState().select(sel)
    }
    const origins = new Map<string, { x: number; y: number }>()
    for (const id of sel) {
      const n = nodeRefs.current.get(id)
      if (n) origins.set(id, { x: n.x(), y: n.y() })
    }
    dragOrigins.current = origins
  }

  const handleDragMove = (layer: Layer) => (e: KonvaEventObject<DragEvent>) => {
    const node = e.target
    const stage = stageRef.current
    if (!stage) return
    const threshold = SNAP_SCREEN_PX / zoom

    // Snap the dragged node's bounding box to canvas edges/centers and sibling boxes.
    const box = node.getClientRect({ relativeTo: stage as unknown as Konva.Container })
    const sel = editor.getState().selection
    const vTargets = [0, scene.width / 2, scene.width]
    const hTargets = [0, scene.height / 2, scene.height]
    for (const [id, other] of nodeRefs.current) {
      if (sel.includes(id)) continue
      const l = scene.layers.find((x) => x.id === id)
      if (!l || !l.visible) continue
      const b = other.getClientRect({ relativeTo: stage as unknown as Konva.Container })
      vTargets.push(b.x, b.x + b.width / 2, b.x + b.width)
      hTargets.push(b.y, b.y + b.height / 2, b.y + b.height)
    }

    const g: Guides = { v: [], h: [] }
    let dx = 0
    let dy = 0
    for (const edge of [box.x, box.x + box.width / 2, box.x + box.width]) {
      const s = snapValue(edge + dx, vTargets, threshold)
      if (s) {
        dx = s.value - edge
        g.v.push(s.line)
        break
      }
    }
    for (const edge of [box.y, box.y + box.height / 2, box.y + box.height]) {
      const s = snapValue(edge + dy, hTargets, threshold)
      if (s) {
        dy = s.value - edge
        g.h.push(s.line)
        break
      }
    }
    if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy })
    setGuides(g)

    // Move the rest of the selection by the same delta.
    const origins = dragOrigins.current
    if (origins && origins.size > 1) {
      const start = origins.get(node.id())
      if (start) {
        const delta = { x: node.x() - start.x, y: node.y() - start.y }
        for (const [id, orig] of origins) {
          if (id === node.id()) continue
          const n = nodeRefs.current.get(id)
          if (n) n.position({ x: orig.x + delta.x, y: orig.y + delta.y })
        }
      }
    }
  }

  const handleDragEnd = () => {
    setGuides({ v: [], h: [] })
    const sel = editor.getState().selection
    editor.getState().transient((s: Scene) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (!sel.includes(l.id)) return l
        const n = nodeRefs.current.get(l.id)
        return n ? ({ ...l, x: n.x(), y: n.y(), touched: true } as Layer) : l
      }),
    }))
    dragOrigins.current = null
  }

  const handleTransformEnd = () => {
    editor.getState().checkpoint()
    const sel = editor.getState().selection
    editor.getState().transient((s: Scene) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (!sel.includes(l.id)) return l
        const n = nodeRefs.current.get(l.id)
        if (!n) return l
        const sx = n.scaleX()
        const sy = n.scaleY()
        n.scale({ x: 1, y: 1 })
        const patch: Partial<Layer> & Record<string, unknown> = {
          x: n.x(),
          y: n.y(),
          rotation: Math.round(n.rotation() * 10) / 10,
          touched: true,
        }
        switch (l.type) {
          case 'image':
          case 'rect':
            patch.width = Math.max(2, l.width * sx)
            patch.height = Math.max(2, l.height * sy)
            break
          case 'text':
            patch.width = Math.max(10, l.width * sx)
            patch.fontSize = Math.max(4, Math.round(l.fontSize * sy * 10) / 10)
            break
          case 'circle':
          case 'polygon':
            patch.radius = Math.max(1, (l.radius * (sx + sy)) / 2)
            break
          case 'star': {
            const f = (sx + sy) / 2
            patch.innerRadius = Math.max(1, l.innerRadius * f)
            patch.outerRadius = Math.max(2, l.outerRadius * f)
            break
          }
          case 'line':
            patch.points = l.points.map((p, i) => (i % 2 === 0 ? p * sx : p * sy))
            break
        }
        return { ...l, ...patch } as Layer
      }),
    }))
  }

  const finalizeMarquee = () => {
    if (!marquee) return
    const box = {
      x: Math.min(marquee.x1, marquee.x2),
      y: Math.min(marquee.y1, marquee.y2),
      w: Math.abs(marquee.x2 - marquee.x1),
      h: Math.abs(marquee.y2 - marquee.y1),
    }
    setMarquee(null)
    const stage = stageRef.current
    if (box.w < 3 / zoom && box.h < 3 / zoom) {
      editor.getState().select([])
      return
    }
    const hit: string[] = []
    for (const [id, node] of nodeRefs.current) {
      const l = scene.layers.find((x) => x.id === id)
      if (!l || !l.visible || l.locked || !stage) continue
      const b = node.getClientRect({ relativeTo: stage as unknown as Konva.Container })
      if (b.x < box.x + box.w && b.x + b.width > box.x && b.y < box.y + box.h && b.y + b.height > box.y) {
        hit.push(id)
      }
    }
    editor.getState().select(hit)
  }

  // Releasing the mouse outside the stage must still end the marquee.
  useEffect(() => {
    if (!marquee) return
    window.addEventListener('mouseup', finalizeMarquee)
    return () => window.removeEventListener('mouseup', finalizeMarquee)
  })

  const editingLayer = scene.layers.find((l) => l.id === editingTextId && l.type === 'text') as
    | TextLayer
    | undefined

  const finishTextEdit = (text: string | null) => {
    const state = editor.getState()
    const id = state.editingTextId
    state.setEditingText(null)
    if (id && text !== null) {
      state.updateLayer(id, { text } as Partial<Layer>)
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom((z) => Math.min(4, Math.max(0.05, z * (1 - e.deltaY * 0.005))))
  }

  return (
    <div className="canvas-area" ref={containerRef} onWheelCapture={onWheel}>
      <div
        className="canvas-scroll"
        onMouseDown={(e) => {
          // Clicking the empty area around the canvas deselects.
          if (e.target === e.currentTarget) editor.getState().select([])
        }}
      >
        <div
          className="canvas-wrapper"
          style={{ width: scene.width * zoom, height: scene.height * zoom }}
        >
          <Stage
            ref={stageRef}
            width={scene.width * zoom}
            height={scene.height * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onMouseDown={(e) => {
              // Start a marquee when pressing on empty canvas; a no-move press deselects.
              if (e.target === e.target.getStage() || e.target.name() === 'canvas-bg') {
                const p = stageRef.current?.getPointerPosition()
                if (p) setMarquee({ x1: p.x / zoom, y1: p.y / zoom, x2: p.x / zoom, y2: p.y / zoom })
              }
            }}
            onMouseMove={() => {
              if (!marquee) return
              const p = stageRef.current?.getPointerPosition()
              if (p) setMarquee({ ...marquee, x2: p.x / zoom, y2: p.y / zoom })
            }}
            onMouseUp={finalizeMarquee}
          >
            <KLayer>
              <Rect
                name="canvas-bg"
                x={0}
                y={0}
                width={scene.width}
                height={scene.height}
                fill={scene.background}
              />
              {scene.layers.map((layer) => (
                <LayerNode
                  key={layer.type === 'text' ? `${layer.id}:f${fontEpoch}` : layer.id}
                  layer={layer}
                  isEditing={layer.id === editingTextId}
                  registerRef={registerRef}
                  onSelect={handleSelect(layer)}
                  onDragStart={handleDragStart(layer)}
                  onDragMove={handleDragMove(layer)}
                  onDragEnd={handleDragEnd}
                  onTransformEnd={handleTransformEnd}
                  onDblClick={() => {
                    if (layer.type === 'text' && !layer.locked) {
                      editor.getState().select([layer.id])
                      editor.getState().setEditingText(layer.id)
                    }
                  }}
                />
              ))}
            </KLayer>
            <KLayer listening={false}>
              {marquee && (
                <Rect
                  x={Math.min(marquee.x1, marquee.x2)}
                  y={Math.min(marquee.y1, marquee.y2)}
                  width={Math.abs(marquee.x2 - marquee.x1)}
                  height={Math.abs(marquee.y2 - marquee.y1)}
                  fill="rgba(59,130,246,0.12)"
                  stroke="#3b82f6"
                  strokeWidth={1 / zoom}
                />
              )}
              {guides.v.map((x, i) => (
                <Line key={`v${i}`} points={[x, 0, x, scene.height]} stroke="#e11d48" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} />
              ))}
              {guides.h.map((y, i) => (
                <Line key={`h${i}`} points={[0, y, scene.width, y]} stroke="#e11d48" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} />
              ))}
            </KLayer>
            {/* Transformer needs its own listening layer — inside the non-listening
                guides layer its anchors can't receive clicks (resize/rotate dead,
                clicks fall through and start a marquee). */}
            <KLayer>
              <Transformer
                ref={trRef}
                rotateEnabled
                keepRatio={false}
                anchorSize={9}
                anchorCornerRadius={2}
                borderStroke="#3b82f6"
                anchorStroke="#3b82f6"
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < 2 || Math.abs(newBox.height) < 2 ? oldBox : newBox
                }
              />
            </KLayer>
          </Stage>
          {editingLayer && (
            <TextEditOverlay
              layer={editingLayer}
              zoom={zoom}
              stage={stageRef.current}
              onDone={finishTextEdit}
            />
          )}
        </div>
      </div>
      <div className="zoom-controls">
        <button onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>+</button>
        <button onClick={() => setZoom(Math.max(0.02, fitZoom))}>Fit</button>
        <button onClick={() => setZoom(1)}>100%</button>
      </div>
    </div>
  )
}
