import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Layer, Page, Project, Scene } from './types'
import { defaultProject } from './types'

const HISTORY_LIMIT = 60

/**
 * Layer clipboard. The serialized form also goes to the OS clipboard on
 * copy/cut, so paste can distinguish "last copy was layers" from "last copy
 * was an image/text in another app" — and layers survive across tabs.
 */
interface LayerClipboard {
  layers: Layer[]
  /** Page the layers came from — pasting elsewhere keeps original coords. */
  pageId: string
}
let clipboard: LayerClipboard | null = null
let clipboardSerial = ''
let pasteSeq = 0

const CLIPBOARD_KEY = 'vectorsmith'

export interface EditorState {
  project: Project
  activePage: number
  selection: string[]
  editingTextId: string | null
  /** Image layer currently in interactive crop mode. */
  croppingId: string | null
  /** Bumped whenever the project is replaced from outside (file sync, AI, load). */
  externalRev: number
  past: Project[]
  future: Project[]

  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  setEditingText: (id: string | null) => void
  setCropping: (id: string | null) => void

  /** Apply a mutation to the ACTIVE page as one undoable step. */
  commit: (mutate: (scene: Page) => Scene) => void
  /** Mutate the active page without a history entry (live drag; checkpoint first). */
  transient: (mutate: (scene: Page) => Scene) => void
  /** Snapshot current project into history (call before a burst of transient edits). */
  checkpoint: () => void
  /** Replace the whole project from an external source (file, AI, project load). */
  replaceProject: (project: Project, opts?: { external?: boolean; recordHistory?: boolean }) => void

  updateLayer: (id: string, patch: Partial<Layer>, opts?: { touch?: boolean; transient?: boolean }) => void
  addLayer: (layer: Layer, position?: number) => void
  removeLayers: (ids: string[]) => void
  duplicateLayers: (ids: string[]) => void
  /** Copy layers to the internal clipboard; returns the serialized form for the OS clipboard. */
  copyLayers: (ids: string[]) => string | null
  /** Paste the internal clipboard onto the active page (offsets repeat pastes). */
  pasteLayers: () => void
  /** Paste from OS-clipboard text; true if it was a layer payload. */
  pasteExternal: (text: string) => boolean
  moveLayer: (id: string, toIndex: number) => void

  setActivePage: (index: number) => void
  addPage: (duplicate?: boolean) => void
  removePage: (index: number) => void
  renamePage: (index: number, name: string) => void

  undo: () => void
  redo: () => void
}

function mutatePage(project: Project, index: number, mutate: (page: Page) => Scene): Project {
  return {
    pages: project.pages.map((p, i) => (i === index ? { ...p, ...mutate(p) } : p)),
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  project: defaultProject(),
  activePage: 0,
  selection: [],
  editingTextId: null,
  croppingId: null,
  externalRev: 0,
  past: [],
  future: [],

  select: (ids) => set({ selection: ids }),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  setEditingText: (id) => set({ editingTextId: id }),
  setCropping: (id) => set({ croppingId: id }),

  commit: (mutate) =>
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT), s.project],
      future: [],
      project: mutatePage(s.project, s.activePage, mutate),
    })),

  transient: (mutate) =>
    set((s) => ({ project: mutatePage(s.project, s.activePage, mutate) })),

  checkpoint: () =>
    set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT), s.project], future: [] })),

  replaceProject: (project, opts) =>
    set((s) => {
      const activePage = Math.min(s.activePage, project.pages.length - 1)
      const layers = project.pages[activePage]?.layers ?? []
      return {
        project,
        activePage,
        selection: s.selection.filter((id) => layers.some((l) => l.id === id)),
        croppingId: null,
        externalRev: opts?.external ? s.externalRev + 1 : s.externalRev,
        ...(opts?.recordHistory === false
          ? {}
          : { past: [...s.past.slice(-HISTORY_LIMIT), s.project], future: [] }),
      }
    }),

  updateLayer: (id, patch, opts) => {
    const apply = (scene: Page): Scene => ({
      ...scene,
      layers: scene.layers.map((l) =>
        l.id === id ? ({ ...l, ...patch, ...(opts?.touch === false ? {} : { touched: true }) } as Layer) : l,
      ),
    })
    if (opts?.transient) get().transient(apply)
    else get().commit(apply)
  },

  addLayer: (layer, position) =>
    get().commit((scene) => {
      const layers = [...scene.layers]
      layers.splice(position ?? layers.length, 0, layer)
      return { ...scene, layers }
    }),

  removeLayers: (ids) => {
    get().commit((scene) => ({
      ...scene,
      layers: scene.layers.filter((l) => !ids.includes(l.id)),
    }))
    set((s) => ({
      selection: s.selection.filter((id) => !ids.includes(id)),
      croppingId: s.croppingId && ids.includes(s.croppingId) ? null : s.croppingId,
    }))
  },

  duplicateLayers: (ids) => {
    const newIds: string[] = []
    get().commit((scene) => {
      const layers = [...scene.layers]
      for (const id of ids) {
        const idx = layers.findIndex((l) => l.id === id)
        if (idx === -1) continue
        const copy: Layer = {
          ...structuredClone(layers[idx]),
          id: nanoid(8),
          name: layers[idx].name + ' copy',
          x: layers[idx].x + 24,
          y: layers[idx].y + 24,
          touched: true,
        }
        newIds.push(copy.id)
        layers.splice(idx + 1, 0, copy)
      }
      return { ...scene, layers }
    })
    set({ selection: newIds })
  },

  copyLayers: (ids) => {
    const s = get()
    const page = s.project.pages[s.activePage]
    const picked = page.layers.filter((l) => ids.includes(l.id))
    if (!picked.length) return null
    clipboard = { layers: picked.map((l) => structuredClone(l)), pageId: page.id }
    pasteSeq = 0
    clipboardSerial = JSON.stringify({ [CLIPBOARD_KEY]: 1, layers: clipboard.layers })
    return clipboardSerial
  },

  pasteLayers: () => {
    const clip = clipboard
    if (!clip?.layers.length) return
    const s = get()
    const page = s.project.pages[s.activePage]
    if (page.id === clip.pageId) {
      pasteSeq += 1
    } else {
      // first paste on another page lands at the original coordinates
      clip.pageId = page.id
      pasteSeq = 0
    }
    const offset = 24 * pasteSeq
    const newIds: string[] = []
    get().commit((scene) => ({
      ...scene,
      layers: [
        ...scene.layers,
        ...clip.layers.map((l) => {
          const copy: Layer = {
            ...structuredClone(l),
            id: nanoid(8),
            x: l.x + offset,
            y: l.y + offset,
            touched: true,
          }
          newIds.push(copy.id)
          return copy
        }),
      ],
    }))
    set({ selection: newIds, croppingId: null })
  },

  pasteExternal: (text) => {
    if (text !== clipboardSerial) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return false
      }
      const p = parsed as { [CLIPBOARD_KEY]?: number; layers?: Layer[] }
      if (p?.[CLIPBOARD_KEY] !== 1 || !Array.isArray(p.layers) || !p.layers.length) return false
      // payload from another tab/session — adopt it, paste at original coords
      clipboard = { layers: p.layers, pageId: '' }
      clipboardSerial = text
      pasteSeq = 0
    }
    get().pasteLayers()
    return true
  },

  moveLayer: (id, toIndex) =>
    get().commit((scene) => {
      const layers = [...scene.layers]
      const from = layers.findIndex((l) => l.id === id)
      if (from === -1) return scene
      const [layer] = layers.splice(from, 1)
      layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, { ...layer, touched: true })
      return { ...scene, layers }
    }),

  setActivePage: (index) =>
    set((s) => ({
      activePage: Math.max(0, Math.min(s.project.pages.length - 1, index)),
      selection: [],
      editingTextId: null,
      croppingId: null,
    })),

  addPage: (duplicate) =>
    set((s) => {
      const cur = s.project.pages[s.activePage]
      const name = `Page ${s.project.pages.length + 1}`
      const page: Page = duplicate
        ? {
            ...structuredClone(cur),
            id: nanoid(6),
            name,
            layers: cur.layers.map((l) => ({ ...structuredClone(l), id: nanoid(8) })),
          }
        : {
            id: nanoid(6),
            name,
            width: cur.width,
            height: cur.height,
            background: cur.background,
            layers: [],
          }
      const pages = [...s.project.pages]
      pages.splice(s.activePage + 1, 0, page)
      return {
        past: [...s.past.slice(-HISTORY_LIMIT), s.project],
        future: [],
        project: { pages },
        activePage: s.activePage + 1,
        selection: [],
        croppingId: null,
      }
    }),

  removePage: (index) =>
    set((s) => {
      if (s.project.pages.length <= 1) return s
      const pages = s.project.pages.filter((_, i) => i !== index)
      return {
        past: [...s.past.slice(-HISTORY_LIMIT), s.project],
        future: [],
        project: { pages },
        activePage: Math.max(0, Math.min(pages.length - 1, s.activePage > index ? s.activePage - 1 : s.activePage)),
        selection: [],
        croppingId: null,
      }
    }),

  renamePage: (index, name) =>
    set((s) => ({
      project: {
        pages: s.project.pages.map((p, i) => (i === index ? { ...p, name } : p)),
      },
    })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s
      const prev = s.past[s.past.length - 1]
      const activePage = Math.min(s.activePage, prev.pages.length - 1)
      return {
        project: prev,
        activePage,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        selection: s.selection.filter((id) => prev.pages[activePage].layers.some((l) => l.id === id)),
        croppingId: null,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      const next = s.future[0]
      const activePage = Math.min(s.activePage, next.pages.length - 1)
      return {
        project: next,
        activePage,
        past: [...s.past, s.project],
        future: s.future.slice(1),
        selection: s.selection.filter((id) => next.pages[activePage].layers.some((l) => l.id === id)),
        croppingId: null,
      }
    }),
}))

/** The page currently being edited. */
export function useScene(): Page {
  return useEditor((s) => s.project.pages[s.activePage] ?? s.project.pages[0])
}

/** Non-reactive accessor for the active page. */
export function getScene(): Page {
  const s = useEditor.getState()
  return s.project.pages[s.activePage] ?? s.project.pages[0]
}

export function makeLayerName(scene: Scene, base: string): string {
  let i = 1
  let name = base
  while (scene.layers.some((l) => l.name === name)) name = `${base} ${++i}`
  return name
}

export { nanoid }
