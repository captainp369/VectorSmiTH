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
export function layerConfig(layer: Layer): { cls: string; config: Record<string, unknown> } {
  const base = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
  }

  switch (layer.type) {
    case 'image':
      return {
        cls: 'Image',
        config: { ...base, width: layer.width, height: layer.height, cornerRadius: layer.cornerRadius ?? 0 },
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
