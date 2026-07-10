# VectorSmith — AI-assisted layered graphic editor

React + TypeScript + Vite + Konva editor. The document is a **scene graph** in
`scene.json` at the project root. The dev server watches that file: **any edit
you make to `scene.json` appears on the user's canvas instantly** (and UI edits
are written back to it). This file IS the AI integration — to design or adjust
a graphic for the user, edit `scene.json`. Never generate a flat image.

## How to fulfill design requests

1. Read `scene.json` (current canvas) and `assets/` (available images).
2. Edit `scene.json`: add/modify/remove layer objects.
3. Done — the canvas updates live; the user fine-tunes by hand and exports from the UI.

**Preserve any layer with `"touched": true`** — the user positioned it manually.
Don't move/restyle/delete it unless explicitly asked. Keep existing layer `id`s
stable when editing. New image layers must reference files in `assets/`
(`"src": "/assets/<file>"`); never invent srcs or use external URLs.

## Scene graph schema

```jsonc
{
  "width": 1280, "height": 720,      // canvas px
  "background": "#ffffff",
  "layers": [ /* index 0 = bottom of z-stack */ ]
}
```

All layers share: `id`, `name`, `x`, `y`, `rotation` (deg, clockwise, around
top-left), `opacity` (0–1), `visible`, `locked`, optional `touched`.

| type | extra fields |
|------|--------------|
| `image` | `src`, `width`, `height`, `cornerRadius?` |
| `text` | `text`, `fontFamily`, `fontSize`, `fontWeight` (`"normal"`,`"bold"`,`"400"`–`"900"`), `fill`, `align` (`left/center/right`), `lineHeight` (multiplier), `width` (wrap box), `stroke?`, `strokeWidth?`, `shadow?` `{color, blur, offsetX, offsetY}` |
| `rect` | `width`, `height`, `fill` (Fill), `cornerRadius?`, `stroke?`, `strokeWidth?` |
| `circle` | `radius`, `fill` (Fill) — **x,y is the center** |
| `polygon` | `sides`, `radius`, `fill` (Fill) — regular n-gon, **x,y is the center**, first vertex points up |
| `star` | `numPoints`, `innerRadius`, `outerRadius`, `fill` (Fill) — **x,y is the center** |
| `line` | `points` `[x1,y1,x2,y2,…]` relative to x,y; `stroke`, `strokeWidth` |

`Fill` = `{"kind":"solid","color":"#hex or rgba()"}` or
`{"kind":"linear-gradient","from","to","angle"}` (CSS angle: 0 = up, 180 = down;
rgba() allowed for transparent stops).

Fonts available: Inter, Archivo Black, Bebas Neue, Playfair Display,
Noto Sans Thai, Kanit, Roboto Mono, Arial, Georgia, Impact.
For Thai text use Kanit or Noto Sans Thai.

## Design guidance

- Strong hierarchy: thumbnails want BIG bold headlines (fontSize ≈ height/6–8).
- Light text over photos needs a dark gradient rect underneath
  (e.g. transparent→`rgba(0,0,0,0.85)`, angle 180).
- Margins ≥ 4% of canvas; don't let text boxes overflow the canvas.

## Dev

- `npm run dev` → http://localhost:5173 (the port also serves `/api/scene`, `/api/assets`).
- Typecheck: `npx tsc --noEmit`. No test suite yet.
- Source layout: `src/types.ts` (schema), `src/store.ts` (zustand + undo),
  `src/sync.ts` (file/localStorage sync), `src/konvaConfig.ts` (layer→Konva,
  shared with export), `src/export.ts` (PNG/JPG/SVG), `src/ai.ts` (in-app
  prompt → Anthropic API), `src/components/*` (UI), `vite.config.ts`
  (scene.json/assets HTTP bridge).
