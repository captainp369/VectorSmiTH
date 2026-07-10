# Contributing

Thanks for your interest! This project is small on purpose — a scene-graph
editor with an AI-editable document format. PRs that keep it simple are the
easiest to merge.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npx tsc --noEmit   # type-check (CI runs this + a production build)
```

No test suite yet; verify changes by exercising the editor. If you use Claude
Code, `CLAUDE.md` teaches it the project — asking it to verify a change in the
browser works well.

## Architecture in one paragraph

`scene.json` is the document — a JSON scene graph (see CLAUDE.md for the
schema). `src/store.ts` holds it in a zustand store with undo history.
`src/sync.ts` keeps the store, `scene.json`, and localStorage in sync through
the dev-server bridge in `vite.config.ts` (REST + SSE), which is what lets
Claude Code edit the file and the canvas update live. `src/konvaConfig.ts`
maps a layer to Konva props and is shared by the live canvas
(`src/components/CanvasStage.tsx`) and the offscreen exporter
(`src/export.ts`) so the export always matches the canvas. `src/ai.ts` is the
optional in-browser Claude API path.

## Adding a new layer type (the most common PR)

Touch these, in order — TypeScript will point out anything you miss:

1. `src/types.ts` — interface + `Layer` union + `layerSize`
2. `src/konvaConfig.ts` — layer → Konva class/config
3. `src/components/CanvasStage.tsx` — render case + transform-end resize case
4. `src/components/Inspector.tsx` — property fields
5. `src/components/Toolbar.tsx` — add button + canvas-resize scaling case
6. `src/components/LayersPanel.tsx` — `TYPE_ICONS` entry
7. `src/export.ts` — SVG serialization case
8. `src/ai.ts` + `CLAUDE.md` — teach the AI the new schema

## Guidelines

- The AI must only ever produce/edit structured scene data — never pixels.
- Anything a user adjusts by hand must set `touched: true` so AI passes
  preserve it.
- Keep dependencies lean; no UI frameworks beyond React + Konva, please.
- Run `npx tsc --noEmit` before pushing; CI blocks on it.
