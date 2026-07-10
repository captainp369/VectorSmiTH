import { useEditor } from './store'
import type { Scene } from './types'
import { defaultScene } from './types'

const LS_KEY = 'vectorsmith:scene'
let applyingExternal = false
let lastPosted = ''
let bridgeAvailable = false

function sanitize(raw: unknown): Scene | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Scene
  if (typeof s.width !== 'number' || typeof s.height !== 'number' || !Array.isArray(s.layers)) return null
  return {
    width: s.width,
    height: s.height,
    background: typeof s.background === 'string' ? s.background : '#ffffff',
    layers: s.layers.filter((l) => l && typeof l === 'object' && typeof l.id === 'string' && typeof l.type === 'string'),
  }
}

async function fetchScene(): Promise<Scene | null> {
  try {
    const res = await fetch('/api/scene')
    if (!res.ok) return null
    bridgeAvailable = true
    return sanitize(await res.json())
  } catch {
    return null
  }
}

function applyExternal(scene: Scene) {
  applyingExternal = true
  lastPosted = JSON.stringify(scene)
  useEditor.getState().replaceScene(scene, { external: true })
  applyingExternal = false
}

/** Load initial scene (scene.json wins over localStorage) and start two-way sync. */
export async function startSync() {
  const fromFile = await fetchScene()
  if (fromFile) {
    applyExternal(fromFile)
  } else {
    try {
      const cached = sanitize(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'))
      if (cached) {
        applyingExternal = true
        useEditor.getState().replaceScene(cached, { external: true, recordHistory: false })
        applyingExternal = false
      }
    } catch {
      /* ignore corrupt cache */
    }
    // Probe whether the bridge exists at all (dev server) so we know to POST.
    try {
      const res = await fetch('/api/assets')
      bridgeAvailable = res.ok
    } catch {
      bridgeAvailable = false
    }
  }

  // UI -> disk + localStorage (debounced)
  let timer: ReturnType<typeof setTimeout> | undefined
  useEditor.subscribe((state, prev) => {
    if (state.scene === prev.scene || applyingExternal) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const json = JSON.stringify(state.scene)
      try {
        localStorage.setItem(LS_KEY, json)
      } catch {
        /* quota — data-URL heavy scenes may not fit; scene.json still saves */
      }
      if (bridgeAvailable && json !== lastPosted) {
        lastPosted = json
        fetch('/api/scene', { method: 'POST', body: json }).catch(() => {})
      }
    }, 400)
  })

  // disk -> UI (Claude Code edits scene.json)
  try {
    const events = new EventSource('/api/scene/events')
    events.onmessage = async () => {
      const scene = await fetchScene()
      if (!scene) return
      if (JSON.stringify(scene) === JSON.stringify(useEditor.getState().scene)) return
      applyExternal(scene)
    }
  } catch {
    /* no dev bridge (static build) */
  }
}

export async function uploadAsset(file: File): Promise<string> {
  if (bridgeAvailable) {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'x-filename': encodeURIComponent(file.name) },
        body: file,
      })
      if (res.ok) return (await res.json()).url as string
    } catch {
      /* fall through to data URL */
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
