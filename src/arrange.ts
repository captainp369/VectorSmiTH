import type { Layer, Scene } from './types'
import { layerBBox } from './types'
import { flipOffset } from './konvaConfig'

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
export type DistributeMode = 'distribute-h' | 'distribute-v'
export type ArrangeMode = AlignMode | DistributeMode

type Box = { x: number; y: number; w: number; h: number }

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: right - x, h: bottom - y }
}

/**
 * The selection split into RIGID UNITS: a fully-selected group counts as one
 * box and every member gets that box's delta. Arranging layer-by-layer is what
 * made a grouped card come apart — "align top" pulled each member to the
 * group's own top edge instead of moving the group.
 *
 * A *partly* selected group is deliberately not rigid: reaching into an open
 * group to align two of its members should align those two to each other, the
 * same as any other pair.
 */
function unitsOf(scene: Scene, ids: string[]): { ids: string[]; box: Box }[] {
  const picked = scene.layers.filter((l) => ids.includes(l.id) && !l.locked)
  const total = new Map<string, number>()
  for (const l of scene.layers) {
    if (l.group && !l.locked) total.set(l.group, (total.get(l.group) ?? 0) + 1)
  }
  const byGroup = new Map<string, Layer[]>()
  for (const l of picked) {
    if (!l.group) continue
    const cur = byGroup.get(l.group)
    if (cur) cur.push(l)
    else byGroup.set(l.group, [l])
  }
  const units: { ids: string[]; box: Box }[] = []
  const rigid = new Set<string>()
  for (const [gid, members] of byGroup) {
    if (members.length < 2 || members.length !== total.get(gid)) continue
    units.push({ ids: members.map((m) => m.id), box: union(members.map(layerBBox)) })
    for (const m of members) rigid.add(m.id)
  }
  for (const l of picked) {
    if (!rigid.has(l.id)) units.push({ ids: [l.id], box: layerBBox(l) })
  }
  return units
}

/**
 * Per-layer x/y deltas for an align/distribute action.
 * One selected unit aligns to the canvas; several align to their common
 * bounding box. Distribution needs ≥3 units and equalizes the gaps.
 * Every member of a unit receives that unit's delta, so groups stay rigid.
 */
export function arrangeDeltas(
  scene: Scene,
  ids: string[],
  mode: ArrangeMode,
): Map<string, { dx: number; dy: number }> {
  const deltas = new Map<string, { dx: number; dy: number }>()
  const units = unitsOf(scene, ids)
  if (!units.length) return deltas

  const put = (unit: { ids: string[] }, dx: number, dy: number) => {
    if (Math.abs(dx) <= 0.01 && Math.abs(dy) <= 0.01) return
    for (const id of unit.ids) deltas.set(id, { dx, dy })
  }

  if (mode === 'distribute-h' || mode === 'distribute-v') {
    if (units.length < 3) return deltas
    const horizontal = mode === 'distribute-h'
    const sorted = [...units].sort((a, b) =>
      horizontal ? a.box.x - b.box.x : a.box.y - b.box.y,
    )
    const first = sorted[0].box
    const last = sorted[sorted.length - 1].box
    const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y
    const total = sorted.reduce((sum, u) => sum + (horizontal ? u.box.w : u.box.h), 0)
    const gap = (span - total) / (sorted.length - 1)
    let cursor = horizontal ? first.x : first.y
    for (const unit of sorted) {
      const current = horizontal ? unit.box.x : unit.box.y
      put(unit, horizontal ? cursor - current : 0, horizontal ? 0 : cursor - current)
      cursor += (horizontal ? unit.box.w : unit.box.h) + gap
    }
    return deltas
  }

  // Alignment target: canvas for a single unit, the selection bounds otherwise.
  const bounds =
    units.length === 1
      ? { x: 0, y: 0, w: scene.width, h: scene.height }
      : union(units.map((u) => u.box))

  for (const unit of units) {
    const box = unit.box
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
    put(unit, dx, dy)
  }
  return deltas
}

/**
 * Rotate a selection rigidly about its own bounding-box centre.
 *
 * A layer rotates about the exact point held in its `x`,`y` — top-left for
 * boxes, the centre for circle/polygon/star — so orbiting that point about the
 * selection centre and adding the angle is correct for every layer type,
 * with no per-type special casing.
 */
export function rotateDeltas(
  scene: Scene,
  ids: string[],
  degrees: number,
): Map<string, { x: number; y: number; rotation: number }> {
  const out = new Map<string, { x: number; y: number; rotation: number }>()
  const picked = scene.layers.filter((l) => ids.includes(l.id) && !l.locked)
  if (!picked.length || !degrees) return out
  const b = union(picked.map(layerBBox))
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const l of picked) {
    const ox = l.x - cx
    const oy = l.y - cy
    out.set(l.id, {
      x: r2(cx + ox * cos - oy * sin),
      y: r2(cy + ox * sin + oy * cos),
      rotation: r2((((l.rotation + degrees) % 360) + 360) % 360),
    })
  }
  return out
}

export type FlipAxis = 'x' | 'y'

/**
 * Mirror the selection about its own bounding box.
 *
 * A true mirror is more than toggling the flag: it also reverses the sense of
 * rotation and moves the layer to the other side of the axis. Writing the
 * mirrored render M·(P + R(θ)·S·(p−O)) back into the same
 * P' + R(θ')·S'·(p−O') form gives θ' = −θ and
 * P' = M·P + 2c + R(−θ)·S'·(O'−O) — which reduces to the terms below, and
 * comes out identical whether the layer was flipped already or not.
 *
 * A single selected layer mirrors about its own centre, so it flips in place.
 */
export function flipUpdates(
  scene: Scene,
  ids: string[],
  axis: FlipAxis,
): Map<string, { x: number; y: number; rotation: number; flipX?: boolean; flipY?: boolean }> {
  const out = new Map<string, { x: number; y: number; rotation: number; flipX?: boolean; flipY?: boolean }>()
  const picked = scene.layers.filter((l) => ids.includes(l.id) && !l.locked)
  if (!picked.length) return out
  const b = union(picked.map(layerBBox))
  const c = axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2
  const r2 = (n: number) => Math.round(n * 100) / 100
  for (const l of picked) {
    const { ox, oy } = flipOffset(l)
    const t = (l.rotation * Math.PI) / 180
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const rotation = r2((((-l.rotation % 360) + 360) % 360))
    out.set(
      l.id,
      axis === 'x'
        ? { x: r2(2 * c - l.x - ox * cos), y: r2(l.y + ox * sin), rotation, flipX: !l.flipX }
        : { x: r2(l.x - oy * sin), y: r2(2 * c - l.y - oy * cos), rotation, flipY: !l.flipY },
    )
  }
  return out
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
