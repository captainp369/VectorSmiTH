import type { Fill, Layer } from './types'
import { gradientPoints } from './types'

/** Konva fill props for a center-origin shape (circle/polygon/star) of visual radius r. */
function centerFill(fill: Fill, r: number): Record<string, unknown> {
  if (fill.kind === 'solid') return { fill: fill.color }
  const { start, end } = gradientPoints(fill.angle, r * 2, r * 2)
  return {
    fillLinearGradientStartPoint: { x: start.x - r, y: start.y - r },
    fillLinearGradientEndPoint: { x: end.x - r, y: end.y - r },
    fillLinearGradientColorStops: [0, fill.from, 1, fill.to],
  }
}

/**
 * Maps a scene-graph layer to a Konva node class + config.
 * Shared by the live editor canvas and the offscreen export renderer,
 * so what you see is exactly what exports.
 * Image layers get their `image` element injected by the caller.
 */
/**
 * The offset a flip mirrors around, in the layer's own local space.
 *
 * Mirroring is scale(-1) applied BEFORE the rotation, so the layer's box and
 * its rotation pivot both stay exactly where they were and only the content
 * turns over. Top-left-origin layers therefore mirror around their own far
 * edge; circle/polygon/star already draw around x,y, and a line's points are
 * relative to it, so for those the origin IS the mirror axis.
 */
export function flipOffset(layer: Layer): { ox: number; oy: number } {
  switch (layer.type) {
    case 'image':
    case 'rect':
      return { ox: layer.width, oy: layer.height }
    case 'text':
      // Konva wraps text, so a wrapped block's real height is not known here;
      // this is exact for unwrapped text and close enough otherwise.
      return { ox: layer.width, oy: layer.fontSize * layer.lineHeight * layer.text.split('\n').length }
    default:
      return { ox: 0, oy: 0 }
  }
}

export function flipTransform(layer: Layer): Record<string, number> {
  if (!layer.flipX && !layer.flipY) return {}
  const { ox, oy } = flipOffset(layer)
  return {
    ...(layer.flipX ? { scaleX: -1, offsetX: ox } : {}),
    ...(layer.flipY ? { scaleY: -1, offsetY: oy } : {}),
  }
}

export function layerConfig(layer: Layer): { cls: string; config: Record<string, unknown> } {
  const base = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    ...(layer.blend && layer.blend !== 'normal'
      ? { globalCompositeOperation: layer.blend }
      : {}),
    ...flipTransform(layer),
  }

  switch (layer.type) {
    case 'image':
      return {
        cls: 'Image',
        config: {
          ...base,
          width: layer.width,
          height: layer.height,
          cornerRadius: layer.cornerRadius ?? 0,
          ...(layer.crop ? { crop: layer.crop } : {}),
        },
      }
    case 'text':
      return {
        cls: 'Text',
        config: {
          ...base,
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontStyle: layer.fontWeight === 'normal' ? 'normal' : layer.fontWeight,
          fill: layer.fill,
          align: layer.align,
          lineHeight: layer.lineHeight,
          letterSpacing: layer.letterSpacing ?? 0,
          width: layer.width,
          wrap: 'word',
          ...(layer.stroke && layer.strokeWidth
            ? { stroke: layer.stroke, strokeWidth: layer.strokeWidth, fillAfterStrokeEnabled: true }
            : {}),
          ...(layer.shadow
            ? {
                shadowColor: layer.shadow.color,
                shadowBlur: layer.shadow.blur,
                shadowOffsetX: layer.shadow.offsetX,
                shadowOffsetY: layer.shadow.offsetY,
              }
            : {}),
        },
      }
    case 'rect': {
      const fill =
        layer.fill.kind === 'solid'
          ? { fill: layer.fill.color }
          : (() => {
              const { start, end } = gradientPoints(layer.fill.angle, layer.width, layer.height)
              return {
                fillLinearGradientStartPoint: start,
                fillLinearGradientEndPoint: end,
                fillLinearGradientColorStops: [0, layer.fill.from, 1, layer.fill.to],
              }
            })()
      return {
        cls: 'Rect',
        config: {
          ...base,
          width: layer.width,
          height: layer.height,
          cornerRadius: layer.cornerRadius ?? 0,
          ...fill,
          ...(layer.stroke && layer.strokeWidth ? { stroke: layer.stroke, strokeWidth: layer.strokeWidth } : {}),
        },
      }
    }
    case 'circle':
      return {
        cls: 'Circle',
        config: {
          ...base,
          radius: layer.radius,
          ...centerFill(layer.fill, layer.radius),
          ...(layer.stroke && layer.strokeWidth ? { stroke: layer.stroke, strokeWidth: layer.strokeWidth } : {}),
        },
      }
    case 'polygon':
      return {
        cls: 'RegularPolygon',
        config: {
          ...base,
          sides: layer.sides,
          radius: layer.radius,
          ...centerFill(layer.fill, layer.radius),
          ...(layer.stroke && layer.strokeWidth ? { stroke: layer.stroke, strokeWidth: layer.strokeWidth } : {}),
        },
      }
    case 'star':
      return {
        cls: 'Star',
        config: {
          ...base,
          numPoints: layer.numPoints,
          innerRadius: layer.innerRadius,
          outerRadius: layer.outerRadius,
          ...centerFill(layer.fill, layer.outerRadius),
          ...(layer.stroke && layer.strokeWidth ? { stroke: layer.stroke, strokeWidth: layer.strokeWidth } : {}),
        },
      }
    case 'line':
      return {
        cls: 'Line',
        config: {
          ...base,
          points: layer.points,
          stroke: layer.stroke,
          strokeWidth: layer.strokeWidth,
          lineCap: 'round',
        },
      }
  }
}
