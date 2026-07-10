import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Layer, Scene } from './types'
import { defaultScene } from './types'

const HISTORY_LIMIT = 60

export interface EditorState {
  scene: Scene
  selection: string[]
  editingTextId: string | null
  /** Bumped whenever the scene is replaced from outside (file sync, AI, load). */
  externalRev: number
  past: Scene[]
  future: Scene[]

  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  setEditingText: (id: string | null) => void

  /** Apply a scene mutation as one undoable step. */
  commit: (mutate: (scene: Scene) => Scene) => void
  /** Mutate without a history entry (used for live drag; commit on release). */
  transient: (mutate: (scene: Scene) => Scene) => void
  /** Snapshot current scene into history (call before a burst of transient edits). */
  checkpoint: () => void
  /** Replace the whole scene from an external source (file, AI, project load). */
  replaceScene: (scene: Scene, opts?: { external?: boolean; recordHistory?: boolean }) => void

  updateLayer: (id: string, patch: Partial<Layer>, opts?: { touch?: boolean; transient?: boolean }) => void
  addLayer: (layer: Layer, position?: number) => void
  removeLayers: (ids: string[]) => void
  duplicateLayers: (ids: string[]) => void
  moveLayer: (id: string, toIndex: number) => void
  undo: () => void
  redo: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  scene: defaultScene(),
  selection: [],
  editingTextId: null,
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

  commit: (mutate) =>
    set((s) => ({
      past: [...s.past.slice(-HISTORY_LIMIT), s.scene],
      future: [],
      scene: mutate(s.scene),
    })),

  transient: (mutate) => set((s) => ({ scene: mutate(s.scene) })),

  checkpoint: () =>
    set((s) => ({ past: [...s.past.slice(-HISTORY_LIMIT), s.scene], future: [] })),

  replaceScene: (scene, opts) =>
    set((s) => ({
      scene,
      selection: s.selection.filter((id) => scene.layers.some((l) => l.id === id)),
      externalRev: opts?.external ? s.externalRev + 1 : s.externalRev,
      ...(opts?.recordHistory === false
        ? {}
        : { past: [...s.past.slice(-HISTORY_LIMIT), s.scene], future: [] }),
    })),

  updateLayer: (id, patch, opts) => {
    const apply = (scene: Scene): Scene => ({
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
    set((s) => ({ selection: s.selection.filter((id) => !ids.includes(id)) }))
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

  moveLayer: (id, toIndex) =>
    get().commit((scene) => {
      const layers = [...scene.layers]
      const from = layers.findIndex((l) => l.id === id)
      if (from === -1) return scene
      const [layer] = layers.splice(from, 1)
      layers.splice(Math.max(0, Math.min(layers.length, toIndex)), 0, { ...layer, touched: true })
      return { ...scene, layers }
    }),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s
      const prev = s.past[s.past.length - 1]
      return {
        scene: prev,
        past: s.past.slice(0, -1),
        future: [s.scene, ...s.future],
        selection: s.selection.filter((id) => prev.layers.some((l) => l.id === id)),
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s
      const next = s.future[0]
      return {
        scene: next,
        past: [...s.past, s.scene],
        future: s.future.slice(1),
        selection: s.selection.filter((id) => next.layers.some((l) => l.id === id)),
      }
    }),
}))

export function makeLayerName(scene: Scene, base: string): string {
  let i = 1
  let name = base
  while (scene.layers.some((l) => l.name === name)) name = `${base} ${++i}`
  return name
}

export { nanoid }
