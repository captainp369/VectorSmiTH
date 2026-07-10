import Konva from 'konva'
import type { Scene, Layer, TextLayer } from './types'
import { gradientPoints, shapePoints } from './types'
import { layerConfig } from './konvaConfig'

const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 100)}`))
      img.src = src
    })
    imageCache.set(src, p)
  }
  return p
}

async function ensureFonts(scene: Scene) {
  const texts = scene.layers.filter((l): l is TextLayer => l.type === 'text')
  await Promise.allSettled(
    texts.map((t) => document.fonts.load(`${t.fontWeight === 'normal' ? '400' : t.fontWeight} 16px "${t.fontFamily}"`, t.text)),
  )
  await document.fonts.ready
}

/** Rasterize the scene graph to a PNG/JPEG blob at exact canvas dimensions × scale. */
export async function renderRaster(scene: Scene, format: 'png' | 'jpeg', scale = 1): Promise<Blob> {
  await ensureFonts(scene)

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-100000px;top:0;'
  document.body.appendChild(container)
  const stage = new Konva.Stage({ container, width: scene.width, height: scene.height })
  const klayer = new Konva.Layer()
  stage.add(klayer)

  try {
    klayer.add(
      new Konva.Rect({ x: 0, y: 0, width: scene.width, height: scene.height, fill: scene.background }),
    )
    for (const layer of scene.layers) {
      if (!layer.visible) continue
      const { cls, config } = layerConfig(layer)
      const node = new (Konva as unknown as Record<string, new (c: object) => Konva.Shape>)[cls](config)
      if (layer.type === 'image') {
        try {
          ;(node as Konva.Image).image(await loadImage(layer.src))
        } catch {
          continue // skip broken images rather than failing the whole export
        }
      }
      klayer.add(node)
    }
    stage.draw()
    const dataUrl = stage.toDataURL({
      mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
      quality: 0.92,
      pixelRatio: scale,
    })
    const res = await fetch(dataUrl)
    return await res.blob()
  } finally {
    stage.destroy()
    container.remove()
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src
  const res = await fetch(src)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function gradientDef(id: string, fill: { from: string; to: string; angle: number }, w: number, h: number): string {
  const { start, end } = gradientPoints(fill.angle, w, h)
  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}">` +
    `<stop offset="0" stop-color="${esc(fill.from)}"/><stop offset="1" stop-color="${esc(fill.to)}"/></linearGradient>`
  )
}

/** Serialize the scene graph to a standalone SVG document (images inlined). */
export async function renderSVG(scene: Scene): Promise<Blob> {
  const defs: string[] = []
  const body: string[] = []
  body.push(`<rect x="0" y="0" width="${scene.width}" height="${scene.height}" fill="${esc(scene.background)}"/>`)

  for (const layer of scene.layers) {
    if (!layer.visible) continue
    const tf = `transform="translate(${layer.x} ${layer.y}) rotate(${layer.rotation})"`
    const op = layer.opacity < 1 ? ` opacity="${layer.opacity}"` : ''

    switch (layer.type) {
      case 'image': {
        let href = ''
        try {
          href = await toDataUrl(layer.src)
        } catch {
          break
        }
        const needsClip = layer.cornerRadius || layer.crop
        let clip = ''
        if (needsClip) {
          const cid = `clip-${layer.id}`
          defs.push(
            `<clipPath id="${cid}"><rect width="${layer.width}" height="${layer.height}" rx="${layer.cornerRadius ?? 0}"/></clipPath>`,
          )
          clip = ` clip-path="url(#${cid})"`
        }
        if (layer.crop) {
          // Scale the full image so the crop region fills the layer box, then clip.
          const img = await loadImage(href)
          const sx = layer.width / layer.crop.width
          const sy = layer.height / layer.crop.height
          body.push(
            `<g ${tf}${op}${clip}><image x="${-layer.crop.x * sx}" y="${-layer.crop.y * sy}" ` +
              `width="${img.naturalWidth * sx}" height="${img.naturalHeight * sy}" href="${href}" preserveAspectRatio="none"/></g>`,
          )
        } else {
          body.push(
            `<image ${tf}${op}${clip} width="${layer.width}" height="${layer.height}" href="${href}" preserveAspectRatio="none"/>`,
          )
        }
        break
      }
      case 'rect': {
        let fill: string
        if (layer.fill.kind === 'solid') fill = esc(layer.fill.color)
        else {
          const gid = `grad-${layer.id}`
          defs.push(gradientDef(gid, layer.fill, layer.width, layer.height))
          fill = `url(#${gid})`
        }
        const stroke = layer.stroke && layer.strokeWidth ? ` stroke="${esc(layer.stroke)}" stroke-width="${layer.strokeWidth}"` : ''
        body.push(
          `<rect ${tf}${op} width="${layer.width}" height="${layer.height}" rx="${layer.cornerRadius ?? 0}" fill="${fill}"${stroke}/>`,
        )
        break
      }
      case 'circle': {
        let fill: string
        if (layer.fill.kind === 'solid') fill = esc(layer.fill.color)
        else {
          const gid = `grad-${layer.id}`
          const d = layer.radius * 2
          const def = gradientDef(gid, layer.fill, d, d)
          // gradient coords are relative to the circle's bounding box top-left
          defs.push(def.replace('gradientUnits="userSpaceOnUse" ', `gradientUnits="userSpaceOnUse" gradientTransform="translate(${-layer.radius} ${-layer.radius})" `))
          fill = `url(#${gid})`
        }
        const stroke = layer.stroke && layer.strokeWidth ? ` stroke="${esc(layer.stroke)}" stroke-width="${layer.strokeWidth}"` : ''
        body.push(`<circle ${tf}${op} cx="0" cy="0" r="${layer.radius}" fill="${fill}"${stroke}/>`)
        break
      }
      case 'polygon':
      case 'star': {
        const r = layer.type === 'polygon' ? layer.radius : layer.outerRadius
        let fill: string
        if (layer.fill.kind === 'solid') fill = esc(layer.fill.color)
        else {
          const gid = `grad-${layer.id}`
          const def = gradientDef(gid, layer.fill, r * 2, r * 2)
          defs.push(def.replace('gradientUnits="userSpaceOnUse" ', `gradientUnits="userSpaceOnUse" gradientTransform="translate(${-r} ${-r})" `))
          fill = `url(#${gid})`
        }
        const stroke = layer.stroke && layer.strokeWidth ? ` stroke="${esc(layer.stroke)}" stroke-width="${layer.strokeWidth}"` : ''
        const pts = shapePoints(layer).map((p) => `${p.x},${p.y}`).join(' ')
        body.push(`<polygon ${tf}${op} points="${pts}" fill="${fill}"${stroke}/>`)
        break
      }
      case 'line': {
        const pts: string[] = []
        for (let i = 0; i < layer.points.length; i += 2) pts.push(`${layer.points[i]},${layer.points[i + 1]}`)
        body.push(
          `<polyline ${tf}${op} points="${pts.join(' ')}" fill="none" stroke="${esc(layer.stroke)}" stroke-width="${layer.strokeWidth}" stroke-linecap="round"/>`,
        )
        break
      }
      case 'text': {
        const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start'
        const ax = layer.align === 'center' ? layer.width / 2 : layer.align === 'right' ? layer.width : 0
        const lineH = layer.fontSize * layer.lineHeight
        const stroke = layer.stroke && layer.strokeWidth ? ` stroke="${esc(layer.stroke)}" stroke-width="${layer.strokeWidth}" paint-order="stroke"` : ''
        const lines = layer.text.split('\n')
        const tspans = lines
          .map(
            (line, i) =>
              // baseline ≈ top + fontSize*0.8 within each line box, mirroring Konva's layout
              `<tspan x="${ax}" y="${i * lineH + lineH / 2 + layer.fontSize * 0.35}">${esc(line) || ' '}</tspan>`,
          )
          .join('')
        body.push(
          `<text ${tf}${op} font-family="${esc(layer.fontFamily)}" font-size="${layer.fontSize}" ` +
            `font-weight="${layer.fontWeight === 'normal' ? '400' : layer.fontWeight}" fill="${esc(layer.fill)}" ` +
            (layer.letterSpacing ? `letter-spacing="${layer.letterSpacing}" ` : '') +
            `text-anchor="${anchor}"${stroke}>${tspans}</text>`,
        )
        break
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" ` +
    `viewBox="0 0 ${scene.width} ${scene.height}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body.join('') +
    '</svg>'
  return new Blob([svg], { type: 'image/svg+xml' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Portable project file: scene with all image sources inlined as data URLs. */
export async function sceneWithInlinedAssets(scene: Scene): Promise<Scene> {
  const layers: Layer[] = []
  for (const l of scene.layers) {
    if (l.type === 'image' && !l.src.startsWith('data:')) {
      try {
        layers.push({ ...l, src: await toDataUrl(l.src) })
        continue
      } catch {
        /* keep original src if fetch fails */
      }
    }
    layers.push(l)
  }
  return { ...scene, layers }
}
