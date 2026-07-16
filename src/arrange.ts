import type { Layer, Scene } from './types'
import { layerBBox } from './types'

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
export type DistributeMode = 'distribute-h' | 'distribute-v'
export type ArrangeMode = AlignMode | DistributeMode

/**
 * Per-layer x/y deltas for an align/distribute action.
 * One selected layer aligns to the canvas; several align to their common
 * bounding box. Distribution needs ≥3 layers and equalizes the gaps.
 */
export function arrangeDeltas(
  scene: Scene,
  ids: string[],
  mode: ArrangeMode,
): Map<string, { dx: number; dy: number }> {
  const deltas = new Map<string, { dx: number; dy: number }>()
  const picked = scene.layers.filter((l) => ids.includes(l.id) && !l.locked)
  if (!picked.length) return deltas
  const boxes = picked.map((l) => ({ layer: l, box: layerBBox(l) }))

  if (mode === 'distribute-h' || mode === 'distribute-v') {
    if (boxes.length < 3) return deltas
    const horizontal = mode === 'distribute-h'
    const sorted = [...boxes].sort((a, b) =>
      horizontal ? a.box.x - b.box.x : a.box.y - b.box.y,
    )
    const first = sorted[0].box
    const last = sorted[sorted.length - 1].box
    const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y
    const total = sorted.reduce((s, b) => s + (horizontal ? b.box.w : b.box.h), 0)
    const gap = (span - total) / (sorted.length - 1)
    let cursor = horizontal ? first.x : first.y
    for (const { layer, box } of sorted) {
      const target = cursor
      const current = horizontal ? box.x : box.y
      if (Math.abs(target - current) > 0.01) {
        deltas.set(layer.id, horizontal ? { dx: target - current, dy: 0 } : { dx: 0, dy: target - current })
      }
      cursor = target + (horizontal ? box.w : box.h) + gap
    }
    return deltas
  }

  // Alignment target: canvas for a single layer, the selection bounds otherwise.
  let bounds: { x: number; y: number; w: number; h: number }
  if (boxes.length === 1) {
    bounds = { x: 0, y: 0, w: scene.width, h: scene.height }
  } else {
    const minX = Math.min(...boxes.map((b) => b.box.x))
    const minY = Math.min(...boxes.map((b) => b.box.y))
    const maxX = Math.max(...boxes.map((b) => b.box.x + b.box.w))
    const maxY = Math.max(...boxes.map((b) => b.box.y + b.box.h))
    bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  for (const { layer, box } of boxes) {
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left': dx = bounds.x - box.x; break
      case 'center-h': dx = bounds.x + (bounds.w - box.w) / 2 - box.x; break
      case 'right': dx = bounds.x + bounds.w - (box.x + box.w); break
      case 'top': dy = bounds.y - box.y; break
      case 'center-v': dy = bounds.y + (bounds.h - box.h) / 2 - box.y; break
      case 'bottom': dy = bounds.y + bounds.h - (box.y + box.h); break
    }
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) deltas.set(layer.id, { dx, dy })
  }
  return deltas
}

export type ReorderDir = 'front' | 'forward' | 'backward' | 'back'

/** New layer order with the given ids moved in z (relative order preserved). */
export function reorderedLayers(layers: Layer[], ids: string[], dir: ReorderDir): Layer[] {
  const selected = layers.filter((l) => ids.includes(l.id))
  if (!selected.length) return layers
  const rest = layers.filter((l) => !ids.includes(l.id))
  if (dir === 'front') return [...rest, ...selected]
  if (dir === 'back') return [...selected, ...rest]

  const result = [...layers]
  const indices = result
    .map((l, i) => (ids.includes(l.id) ? i : -1))
    .filter((i) => i !== -1)
  if (dir === 'forward') {
    for (let k = indices.length - 1; k >= 0; k--) {
      const i = indices[k]
      if (i + 1 < result.length && !ids.includes(result[i + 1].id)) {
        ;[result[i], result[i + 1]] = [result[i + 1], result[i]]
      }
    }
  } else {
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k]
      if (i - 1 >= 0 && !ids.includes(result[i - 1].id)) {
        ;[result[i], result[i - 1]] = [result[i - 1], result[i]]
      }
    }
  }
  return result
}
