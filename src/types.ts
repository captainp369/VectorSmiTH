/**
 * The scene graph. This is the single source of truth for a document:
 * the UI renders it, the AI reads and edits it, exports rasterize it.
 * Layer order in `layers` is z-order: index 0 is the bottom-most layer.
 */

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear-gradient'; from: string; to: string; angle: number }

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
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  src: string // /assets/... path or data URL
  width: number
  height: number
  cornerRadius?: number
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
