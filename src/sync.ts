import { useEditor } from './store'
import type { Project } from './types'
import { migrateProject } from './types'

const LS_KEY = 'vectorsmith:scene'
let applyingExternal = false
let lastPosted = ''
let bridgeAvailable = false

async function fetchProject(): Promise<Project | null> {
  try {
    const res = await fetch('/api/scene')
    if (!res.ok) return null
    bridgeAvailable = true
    return migrateProject(await res.json())
  } catch {
    return null
  }
}

function applyExternal(project: Project) {
  applyingExternal = true
  lastPosted = JSON.stringify(project)
  useEditor.getState().replaceProject(project, { external: true })
  applyingExternal = false
}

/** Load initial project (scene.json wins over localStorage) and start two-way sync. */
export async function startSync() {
  const fromFile = await fetchProject()
  if (fromFile) {
    applyExternal(fromFile)
  } else {
    try {
      const cached = migrateProject(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'))
      if (cached) {
        applyingExternal = true
        useEditor.getState().replaceProject(cached, { external: true, recordHistory: false })
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
    if (state.project === prev.project || applyingExternal) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const json = JSON.stringify(state.project)
      try {
        localStorage.setItem(LS_KEY, json)
      } catch {
        /* quota — data-URL heavy projects may not fit; scene.json still saves */
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
    const pullFromDisk = async () => {
      const project = await fetchProject()
      if (!project) return
      if (JSON.stringify(project) === JSON.stringify(useEditor.getState().project)) return
      applyExternal(project)
    }
    events.onmessage = pullFromDisk
    // File events emitted while the stream is (re)connecting are lost — e.g.
    // right after a dev-server restart. Re-sync from disk on every (re)open
    // so the file stays the source of truth.
    events.onopen = pullFromDisk
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
