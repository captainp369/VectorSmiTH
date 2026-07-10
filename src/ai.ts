import type { Scene } from './types'

const SYSTEM_PROMPT = `You are a graphic designer that edits a JSON scene graph for a layered canvas editor.

The scene graph format:
{
  "width": number, "height": number, "background": "#hex",
  "layers": [ ... ] // z-order: index 0 = bottom-most
}

Layer types (all share: id, name, x, y, rotation (deg), opacity (0..1), visible, locked, touched?):
- { "type": "image", "src": string, "width", "height", "cornerRadius"?, "crop"?: {x, y, width, height} (source-image px) }
- { "type": "text", "text", "fontFamily", "fontSize", "fontWeight" ("normal"|"bold"|"400".."900"), "fill": "#hex", "align" ("left"|"center"|"right"), "lineHeight" (multiplier, e.g. 1.1), "letterSpacing"? (px), "width" (wrap box), "stroke"?, "strokeWidth"? (text outline/border), "shadow"?: {color, blur, offsetX, offsetY} }
- { "type": "rect", "width", "height", "fill", "cornerRadius"?, "stroke"?, "strokeWidth"? }
- { "type": "circle", "radius", "fill" }  // x,y is the circle CENTER
- { "type": "polygon", "sides", "radius", "fill" }  // regular n-gon, x,y CENTER, first vertex up
- { "type": "star", "numPoints", "innerRadius", "outerRadius", "fill" }  // x,y CENTER
- { "type": "line", "points": [x1,y1,x2,y2,...] (relative to layer x,y), "stroke", "strokeWidth" }

"fill" for rect/circle/polygon/star is either { "kind": "solid", "color": "#hex or rgba()" } or { "kind": "linear-gradient", "from", "to", "angle" } (CSS angle: 0=up, 180=down; colors may be rgba() for transparency).

Available fonts: Inter, Archivo Black, Bebas Neue, Playfair Display, Noto Sans Thai, Kanit, Roboto Mono, Arial, Georgia, Impact. Use "Noto Sans Thai" or "Kanit" for Thai text.

Rules:
1. Return the COMPLETE updated scene as a single JSON object in a \`\`\`json code block. No other JSON in your reply.
2. NEVER remove or restyle layers whose "touched" is true unless the user explicitly asks to change them. You may leave them exactly as-is.
3. Keep existing layer ids stable when editing a layer. New layers get new short ids.
4. Image src values like "__ASSET_0__" are placeholders for real files — reuse them verbatim; never invent image srcs that were not given to you, and never use external URLs.
5. Design well: strong visual hierarchy, readable contrast (e.g. dark gradient rect behind light text over photos), margins ≥ 4% of canvas, don't let text overflow the canvas. Thumbnails want BIG bold text.
6. Do not rasterize anything; only structured layers.`

export interface AISettings {
  apiKey: string
  model: string
}

export const DEFAULT_MODEL = 'claude-sonnet-5'

export function loadAISettings(): AISettings {
  return {
    apiKey: localStorage.getItem('vectorsmith:apikey') ?? '',
    model: localStorage.getItem('vectorsmith:model') ?? DEFAULT_MODEL,
  }
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem('vectorsmith:apikey', s.apiKey)
  localStorage.setItem('vectorsmith:model', s.model)
}

/** Swap bulky data-URL image sources for short placeholders before prompting. */
function stashAssets(scene: Scene): { lean: Scene; stash: Map<string, string> } {
  const stash = new Map<string, string>()
  const lean: Scene = {
    ...scene,
    layers: scene.layers.map((l) => {
      if (l.type === 'image' && l.src.length > 200) {
        const key = `__ASSET_${stash.size}__`
        stash.set(key, l.src)
        return { ...l, src: key }
      }
      return l
    }),
  }
  return { lean, stash }
}

function restoreAssets(scene: Scene, stash: Map<string, string>): Scene {
  return {
    ...scene,
    layers: scene.layers.map((l) =>
      l.type === 'image' && stash.has(l.src) ? { ...l, src: stash.get(l.src)! } : l,
    ),
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  return JSON.parse(raw)
}

export async function runPrompt(prompt: string, scene: Scene, settings: AISettings): Promise<Scene> {
  const { lean, stash } = stashAssets(scene)
  const { useFonts } = await import('./fonts')
  const custom = useFonts.getState().custom
  const fontNote = custom.length ? `\n\nAdditional custom fonts available: ${custom.join(', ')}` : ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Current scene graph:\n\`\`\`json\n${JSON.stringify(lean, null, 1)}\n\`\`\`${fontNote}\n\nRequest: ${prompt}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API error ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n')

  const parsed = extractJson(text) as Scene
  if (
    typeof parsed?.width !== 'number' ||
    typeof parsed?.height !== 'number' ||
    !Array.isArray(parsed?.layers)
  ) {
    throw new Error('The model did not return a valid scene graph.')
  }
  return restoreAssets(parsed, stash)
}
