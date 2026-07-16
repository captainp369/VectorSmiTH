# VectorSmith — AI-assisted layered graphic editor

React + TypeScript + Vite + Konva editor. The document is a **scene graph** in
`scene.json` at the project root. The dev server watches that file: **any edit
you make to `scene.json` appears on the user's canvas instantly** (and UI edits
are written back to it). This file IS the AI integration — to design or adjust
a graphic for the user, edit `scene.json`. Never generate a flat image.

## How to fulfill design requests

0. **Read `GRAPHIC_PHILOSOPHY.md` first — required.** Style packs, depth &
   light laws, the SVG-asset technique (glows/glass/3D live in `assets/*.svg`,
   not in scene layers), ImageMagick preprocessing, and the
   `assets/ASSET_REQUESTS.md` protocol for photos the user must supply.
1. Read `scene.json` (current canvas) and `assets/` (available images).
2. Edit `scene.json`: add/modify/remove layer objects.
3. Done — the canvas updates live; the user fine-tunes by hand and exports from the UI.

**Preserve any layer with `"touched": true`** — the user positioned it manually.
Don't move/restyle/delete it unless explicitly asked. Keep existing layer `id`s
stable when editing. New image layers must reference files in `assets/`
(`"src": "/assets/<file>"`); never invent srcs or use external URLs.

## Scene graph schema

`scene.json` holds a **project with one or more pages** (a page = one canvas;
multiple pages = carousel slides / variants). Legacy single-scene files
(top-level `width`/`layers`) are still accepted and migrated on load.

```jsonc
{
  "pages": [
    {
      "id": "abc123", "name": "Page 1",
      "width": 1280, "height": 720,      // canvas px
      "background": "#ffffff",
      "layers": [ /* index 0 = bottom of z-stack */ ]
    }
  ]
}
```

Keep page `id`s stable. For a **continuous carousel** (one visual flowing
across slides): put the same image layer on consecutive pages, shifting its
`x` by `-width` per page — layers are clipped to the canvas, so the overflow
simply appears on the next slide.

All layers share: `id`, `name`, `x`, `y`, `rotation` (deg, clockwise, around
top-left), `opacity` (0–1), `visible`, `locked`, optional `touched`.

| type | extra fields |
|------|--------------|
| `image` | `src`, `width`, `height`, `cornerRadius?`, `crop?` `{x, y, width, height}` in source-image pixels (region shown in the layer box) |
| `text` | `text`, `fontFamily`, `fontSize`, `fontWeight` (`"normal"`,`"bold"`,`"400"`–`"900"`), `fill`, `align` (`left/center/right`), `lineHeight` (multiplier), `letterSpacing?` (px), `width` (wrap box), `stroke?` + `strokeWidth?` (text outline/border), `shadow?` `{color, blur, offsetX, offsetY}` |
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
Font files (.ttf/.otf/.woff/.woff2) in `assets/` are auto-registered as extra
families named after the file (e.g. `assets/My_Brand.ttf` → "My Brand") — you
may use those too.

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
