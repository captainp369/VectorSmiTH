import { create } from 'zustand'
import { uploadAsset } from './sync'

const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2']

interface FontState {
  custom: string[]
  add: (family: string) => void
}

/** Custom font families registered this session (uploaded or found in assets/). */
export const useFonts = create<FontState>((set) => ({
  custom: [],
  add: (family) =>
    set((s) => (s.custom.includes(family) ? s : { custom: [...s.custom, family].sort() })),
}))

function familyFromFilename(name: string): string {
  return decodeURIComponent(name.replace(/\.[^.]+$/, '')).replace(/[_-]+/g, ' ').trim()
}

async function registerFont(family: string, url: string): Promise<void> {
  const face = new FontFace(family, `url("${url}")`)
  await face.load()
  document.fonts.add(face)
  useFonts.getState().add(family)
}

/** Register every font file already sitting in assets/ (family = filename). */
export async function loadAssetFonts() {
  try {
    const res = await fetch('/api/assets')
    if (!res.ok) return
    const files: string[] = await res.json()
    await Promise.allSettled(
      files
        .filter((f) => FONT_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
        .map((f) => registerFont(familyFromFilename(f.split('/').pop()!), f)),
    )
  } catch {
    /* no dev bridge */
  }
}

/** Upload a local font file, register it, and return the family name. */
export async function uploadFontFile(file: File): Promise<string> {
  const url = await uploadAsset(file)
  const family = familyFromFilename(file.name)
  await registerFont(family, url)
  return family
}
