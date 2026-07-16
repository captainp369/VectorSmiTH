/**
 * The scene graph. This is the single source of truth for a document:
 * the UI renders it, the AI reads and edits it, exports rasterize it.
 * Layer order in `layers` is z-order: index 0 is the bottom-most layer.
 */

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear-gradient'; from: string; to: string; angle: number }

/** Same names in canvas globalCompositeOperation and CSS mix-blend-mode. */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'soft-light',
  'hard-light',
  'color-dodge',
  'color-burn',
  'difference',
  'exclusion',
  'luminosity',
] as const
export type BlendMode = (typeof BLEND_MODES)[number]

export interface LayerBase {
  id: string
  name: string
  x: number
  y: number
  rotation: number // degrees, clockwise, around the layer's top-left corner
  opacity: number // 0..1
  visible: boolean
  locked: boolean
  /** Set when the user manually adjusted this layer; the AI must preserve it. */
  touched?: boolean
  /** Layers sharing a group id select and move together (⌘G / ⇧⌘G). */
  group?: string
  /** How this layer's pixels combine with the layers below (default: normal). */
  blend?: BlendMode
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  src: string // /assets/... path or data URL
  width: number
  height: number
  cornerRadius?: number
  /** Visible region of the source image, in source-image pixels. Omitted = whole image. */
  crop?: { x: number; y: number; width: number; height: number }
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: string // 'normal' | 'bold' | '400'...'900'
  fill: string
  align: 'left' | 'center' | 'right'
  lineHeight: number // multiplier
  letterSpacing?: number // px
  width: number // wrapping box width
  stroke?: string
  strokeWidth?: number
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number }
}

export interface RectLayer extends LayerBase {
  type: 'rect'
  width: number
  height: number
  fill: Fill
  cornerRadius?: number
  stroke?: string
  strokeWidth?: number
}

export interface CircleLayer extends LayerBase {
  type: 'circle'
  radius: number
  fill: Fill
  stroke?: string
  strokeWidth?: number
}

export interface LineLayer extends LayerBase {
  type: 'line'
  points: number[] // [x1,y1,x2,y2,...] relative to layer x/y
  stroke: string
  strokeWidth: number
}

export interface PolygonLayer extends LayerBase {
  type: 'polygon' // regular n-gon; x,y is the CENTER, first vertex points up
  sides: number
  radius: number
  fill: Fill
  stroke?: string
  strokeWidth?: number
}

export interface StarLayer extends LayerBase {
  type: 'star' // x,y is the CENTER
  numPoints: number
  innerRadius: number
  outerRadius: number
  fill: Fill
  stroke?: string
  strokeWidth?: number
}

export type Layer =
  | ImageLayer
  | TextLayer
  | RectLayer
  | CircleLayer
  | LineLayer
  | PolygonLayer
  | StarLayer

export interface Scene {
  width: number
  height: number
  background: string
  layers: Layer[]
}

/** One canvas in a project (a carousel slide, a variant, …). */
export interface Page extends Scene {
  id: string
  name: string
}

/** The document stored in scene.json. */
export interface Project {
  pages: Page[]
}

function pageId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function defaultProject(width = 1280, height = 720): Project {
  return { pages: [{ id: pageId(), name: 'Page 1', ...defaultScene(width, height) }] }
}

/**
 * Accepts either the current {pages:[...]} format or a legacy single-scene
 * file and returns a normalized Project (null if it's neither).
 */
export function migrateProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null
  const asProject = raw as Project
  if (Array.isArray(asProject.pages)) {
    const pages = asProject.pages
      .filter((p) => p && typeof p.width === 'number' && typeof p.height === 'number' && Array.isArray(p.layers))
      .map((p, i) => ({
        ...p,
        id: typeof p.id === 'string' ? p.id : pageId(),
        name: typeof p.name === 'string' ? p.name : `Page ${i + 1}`,
        background: typeof p.background === 'string' ? p.background : '#ffffff',
        layers: p.layers.filter((l) => l && typeof l.id === 'string' && typeof l.type === 'string'),
      }))
    return pages.length ? { pages } : null
  }
  const asScene = raw as Scene
  if (typeof asScene.width === 'number' && typeof asScene.height === 'number' && Array.isArray(asScene.layers)) {
    return {
      pages: [
        {
          id: pageId(),
          name: 'Page 1',
          width: asScene.width,
          height: asScene.height,
          background: typeof asScene.background === 'string' ? asScene.background : '#ffffff',
          layers: asScene.layers.filter((l) => l && typeof l.id === 'string' && typeof l.type === 'string'),
        },
      ],
    }
  }
  return null
}

export const CANVAS_PRESETS: { name: string; width: number; height: number }[] = [
  { name: 'YouTube thumbnail', width: 1280, height: 720 },
  { name: 'Instagram post', width: 1080, height: 1080 },
  { name: 'Instagram story', width: 1080, height: 1920 },
  { name: 'Twitter/X post', width: 1600, height: 900 },
  { name: 'Open Graph image', width: 1200, height: 630 },
]

export const FONT_FAMILIES = [
  'Inter',
  'Archivo Black',
  'Bebas Neue',
  'Playfair Display',
  'Noto Sans Thai',
  'Kanit',
  'Roboto Mono',
  'Arial',
  'Georgia',
  'Impact',
]

export function defaultScene(width = 1280, height = 720): Scene {
  return { width, height, background: '#ffffff', layers: [] }
}

/** Start/end points for a linear gradient across a w×h box, CSS angle convention (0deg = up). */
export function gradientPoints(angle: number, w: number, h: number) {
  const a = ((angle % 360) * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2
  return {
    start: { x: w / 2 - dx * half, y: h / 2 - dy * half },
    end: { x: w / 2 + dx * half, y: h / 2 + dy * half },
  }
}

/** Axis-aligned bounding size of a layer (ignoring rotation). */
export function layerSize(layer: Layer): { w: number; h: number } {
  switch (layer.type) {
    case 'image':
    case 'rect':
      return { w: layer.width, h: layer.height }
    case 'text':
      return { w: layer.width, h: layer.fontSize * layer.lineHeight * Math.max(1, layer.text.split('\n').length) }
    case 'circle':
      return { w: layer.radius * 2, h: layer.radius * 2 }
    case 'line': {
      const xs = layer.points.filter((_, i) => i % 2 === 0)
      const ys = layer.points.filter((_, i) => i % 2 === 1)
      return { w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1 }
    }
    case 'polygon':
      return { w: layer.radius * 2, h: layer.radius * 2 }
    case 'star':
      return { w: layer.outerRadius * 2, h: layer.outerRadius * 2 }
  }
}

/**
 * Axis-aligned bounding box of a layer in canvas coordinates, accounting for
 * rotation and for center-origin shapes (circle/polygon/star).
 */
export function layerBBox(layer: Layer): { x: number; y: number; w: number; h: number } {
  const { w, h } = layerSize(layer)
  // Local box relative to the rotation origin (layer.x/y).
  let lx = 0
  let ly = 0
  if (layer.type === 'circle' || layer.type === 'polygon' || layer.type === 'star') {
    lx = -w / 2
    ly = -h / 2
  } else if (layer.type === 'line') {
    lx = Math.min(...layer.points.filter((_, i) => i % 2 === 0))
    ly = Math.min(...layer.points.filter((_, i) => i % 2 === 1))
  }
  const a = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [px, py] of [
    [lx, ly],
    [lx + w, ly],
    [lx, ly + h],
    [lx + w, ly + h],
  ]) {
    const rx = layer.x + px * cos - py * sin
    const ry = layer.y + px * sin + py * cos
    minX = Math.min(minX, rx)
    minY = Math.min(minY, ry)
    maxX = Math.max(maxX, rx)
    maxY = Math.max(maxY, ry)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Vertices of a regular polygon / star, matching Konva's layout (first point up). */
export function shapePoints(layer: PolygonLayer | StarLayer): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  if (layer.type === 'polygon') {
    for (let i = 0; i < layer.sides; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / layer.sides
      pts.push({ x: Math.cos(a) * layer.radius, y: Math.sin(a) * layer.radius })
    }
  } else {
    for (let i = 0; i < layer.numPoints * 2; i++) {
      const r = i % 2 === 0 ? layer.outerRadius : layer.innerRadius
      const a = -Math.PI / 2 + (i * Math.PI) / layer.numPoints
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
    }
  }
  return pts
}
