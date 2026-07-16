# GRAPHIC PHILOSOPHY — How VectorSmith graphics escape the "default AI thumbnail"

> **Required reading before fulfilling any design request in this project.**
> The failure mode this file kills: photo on the left, bold white text with a
> black stroke on the right, dark gradient scrim, done. That's the default
> output of every AI design tool, and viewers scroll past it. The fix: pick a
> **style pack** (§3), build **depth and light** (§4), and use the **asset
> pipeline** (§2, §5) for anything the scene schema can't express.

---

## 0 · Know your instrument — what the scene graph can and cannot do

Honest capability table (from the schema in `CLAUDE.md`):

| Capability | In-schema? | Workaround |
|---|---|---|
| Solid + linear-gradient fills | ✅ | — |
| Radial gradients / glows | ❌ | SVG or PNG asset (§2) |
| Blur / soft shadows on shapes & images | ❌ (shadow is text-only) | Bake into an SVG/PNG asset |
| Text shadow / stroke | ✅ | — |
| Gradient-filled text (chrome type) | ❌ (text `fill` is a color) | Layered-text tricks (§4.3) or SVG headline asset |
| Skew / perspective | ❌ (rotation only) | Pre-skewed SVG asset |
| Image crop + corner radius | ✅ | — |
| Outline around a cutout | ❌ | Preprocess the PNG (§5.2) |

**Consequence:** scene layers do *structure* — composition, type, flat/gradient
color blocks, shapes. Everything soft (glow, glass refraction, 3D shading,
bokeh) enters as an **asset file**. That division is not a limitation; it's
the workflow.

---

## 1 · The three questions before any scene edit

1. **Which style pack?** (§3). If the user's channel already has one, reuse it
   — consistency across thumbnails beats novelty per thumbnail.
2. **What's the ONE focal point?** A thumbnail is read in ~0.4s at 168px wide.
   One subject, one headline (≤ 4 words), max one supporting prop. Three
   elements total is the ceiling.
3. **Where does depth come from?** At least two of: overlap (subject in front
   of the card/text), glow separation (rim light behind subject), scale
   contrast (huge prop vs small subject), extrusion (§4.3).

---

## 2 · The SVG-asset superpower

Claude can author **full SVG files** into `assets/` and place them as `image`
layers — and full SVG has everything the schema lacks: radial gradients,
`feGaussianBlur`, opacity masks, complex paths. This is how glows, liquid
glass, blobs, and 3D-looking objects get onto the canvas.

```
assets/
  glow-teal.svg          ← radial-gradient disc, feGaussianBlur, for rim light
  glass-terminal.svg     ← the whole liquid-glass window as one crisp asset
  headline-chrome.svg    ← gradient-filled display type
  blob-3d.svg            ← shaded organic shape with highlight + core shadow
```

Rules:

- **Self-contained SVG only** — an SVG loaded as an image cannot reference
  external files, so no `<image href="photo.jpg">` pointing at another file
  (inline data-URIs work but bloat; prefer preprocessing PNGs instead, §5.2).
- Set explicit `width`/`height` + `viewBox`; size the layer at a clean scale.
- Give gradients/filters unique `id`s per file.
- Text inside SVG: convert to paths OR stick to the fonts listed in
  `CLAUDE.md` (browser must have them to rasterize).
- After the first SVG asset of a session, sanity-check it renders on canvas
  and survives PNG export once; then trust the pipeline.

A reusable glow, for reference:

```svg
<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#33d4c8" stop-opacity="0.85"/>
    <stop offset="55%" stop-color="#33d4c8" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#33d4c8" stop-opacity="0"/>
  </radialGradient></defs>
  <circle cx="400" cy="400" r="380" fill="url(#g)"/>
</svg>
```

---

## 3 · Style packs

Pick ONE per graphic. Each pack lists its layer-stack recipe bottom→top.

### 3A · Dark Glass Tech — "person pointing at a liquid-glass terminal"

The premium dev/AI-content look. Matches the video studio's Premium Dark pack
(`MOTION_PHILOSOPHY.md` over in ClaudeVideoEditing) so thumbnails match intros.

Layer stack (bottom → top):

1. **Background** — rect, linear-gradient `#0a0a12 → #141428`, angle 160.
2. **Atmosphere** — 1–2 glow SVGs (accent color), large, low opacity (0.5–0.7),
   placed behind where the subject and prop will sit.
3. **The glass prop** (terminal/card/phone) — either one `glass-terminal.svg`
   asset, or in-schema: rect with 4-stop-feel gradient
   `rgba(255,255,255,0.14) → rgba(255,255,255,0.04)`, cornerRadius 20,
   stroke `rgba(255,255,255,0.45)` width 1.5; PLUS a 2–3px high white rect at
   0.35 opacity along the inside top edge (the "liquid glass" inner highlight);
   PLUS three 10px traffic-light circles; PLUS monospace prompt text
   (`Roboto Mono`, accent color) inside — the prompt text should be a real,
   readable, intriguing line, not lorem.
4. **Rim glow** — a tighter accent glow SVG directly behind the subject cutout.
5. **Subject cutout** — transparent PNG, **overlapping the glass prop's edge**
   (overlap = the whole 3D illusion). Pointing/looking AT the prop.
6. **Headline** — 2–4 words, `Archivo Black` or `Bebas Neue`, white, subtle
   text shadow `{color: rgba(0,0,0,0.6), blur: 24, offsetY: 8}`; one word in
   the accent color. Chrome look when wanted: `headline-chrome.svg` asset.

One accent color per graphic (teal `#33d4c8`, purple `#a155ff`, or orange
`#ff9430`) — same symbolic-palette law as the video pack.

### 3B · Sticker Pop — the viral cutout look

High-energy, bright. Layer stack:

1. Background — saturated gradient rect (two neighboring hues, e.g.
   `#ffd84a → #ff9430`) + a `star` or `polygon` burst behind the subject
   (large, darker shade of bg, opacity 0.6, rotation ~15°).
2. Subject cutout **with a thick white sticker border** (preprocessed PNG,
   §5.2), big — 60–80% of canvas height, exaggerated expression.
3. Props as bordered cutouts or sketch-style SVG, each rotated ±3–8°.
4. Extruded headline (§4.3), possibly rotated −2°, overlapping the subject's
   shoulder (overlap again = depth).

### 3C · Editorial Paper — matches the Vox video pack

Paper `#F5F0E6` bg rect + ink `#1B1A17` type (serif display: `Playfair
Display`), one highlighter bar (`#FFD437` rect, rotation −1°, behind the key
word), duotone photo block (§5.2 preprocess), hand-drawn SVG arrow/circle.
Quiet, high-trust, great for explainer content.

### 3D · Neon Wire — dark bg, glowing line-art SVG diagram as the hero, mono
labels. For architecture/coding topics where a diagram IS the hook. All glow
comes from SVG assets (blurred duplicate paths under crisp ones).

---

## 4 · Depth & light laws (any pack)

1. **Overlap or it's flat.** The subject must overlap SOMETHING (card edge,
   headline, prop). Side-by-side arrangements read as a slide, not a scene.
2. **One light direction.** If the glow is top-left, every shadow offsets
   bottom-right (text shadows too). Mixed light = collage soup.
3. **Rim-light every cutout on a dark bg** — a glow SVG behind it, or the
   subject melts into the background at small sizes.
4. **The 168px test.** Export mentally at 168×94: can you still read the
   emotion + the headline? If any element disappears, it was decoration —
   remove it (don't shrink the rest).
5. **Margins ≥ 4%**, but let ONE hero element bleed off-canvas — a cropped
   edge implies the world continues (that's a depth cue too).

### 4.3 · Faking dimension in-schema

- **Extruded type:** N=5–8 copies of the text layer, each offset +3px x/+4px y
  progressively, in a darker shade; top copy full color. (Keep copies grouped
  by name: `HEADLINE ext 1..n`.)
- **Card thickness:** duplicate the card rect, darker fill, offset 6–10px
  down-right, behind the main rect.
- **Floor shadow:** wide flat ellipse... no ellipse in schema — use a `circle`
  scaled by placing it mostly off... not possible; use a soft-shadow SVG
  asset, or a low-opacity dark rect with large cornerRadius under the object.
- **Isometric-ish:** rotation ±12–15° on rect stacks suggests tilt; true skew
  needs an SVG asset.

---

## 5 · Asset pipeline

### 5.1 Request protocol (photos, renders, brand assets)

Same protocol as the video studio: write `assets/ASSET_REQUESTS.md` —

```markdown
| # | save as | what I need | specs | used for |
|---|---------|-------------|-------|----------|
| 1 | captain-pointing.png | You, pointing left, surprised face | transparent PNG, ≥ 1500px tall | 3A subject |
```

Tell the user in chat; build with a placeholder rect meanwhile; specs:
cutouts ≥ 1200px tall transparent PNG (macOS Preview → Remove Background),
full-frame photos ≥ 1920px wide. Never upscale past ~130%.

### 5.2 Preprocess dropped assets locally (ImageMagick)

```bash
# thick white sticker border around a cutout (pack 3B)
magick subject.png \( +clone -alpha extract -morphology dilate disk:18 \
  -threshold 1% \) -compose DstOver -background white -alpha shape \
  -composite subject-sticker.png

# duotone for Editorial Paper (grayscale → ink/paper map)
magick photo.jpg -colorspace gray -level 5%,95% \
  \( -size 256x1 gradient:'#1B1A17'-'#F5F0E6' \) -clut photo-duotone.png

# baked drop shadow (since the schema can't blur)
magick subject.png \( +clone -background '#000' -shadow 60x24+0+18 \) \
  +swap -background none -layers merge +repage subject-shadow.png
```

(`brew install imagemagick` if missing.) Outputs go to `assets/` with clear
suffixes; the scene references the processed file.

### 5.3 Generative image MCP — optional, later

Not required. SVG assets + user photos + ImageMagick cover all four packs.
If a photoreal element neither can supply becomes common (e.g. 3D character
renders), wire an image-gen MCP then; outputs land in `assets/` under the
same naming rules.

---

## 6 · Anti-patterns

- ❌ **The default:** photo + white-text-black-stroke + gradient scrim. If the
  result could come from a thumbnail generator, start over with a pack.
- ❌ **No overlap between layers.** Flat = scroll-past.
- ❌ **Headline > 4 words**, or more than 2 font families on one canvas.
- ❌ **Cutout with no rim light on dark backgrounds.**
- ❌ **Redrawing third-party logos from memory** — request the real file.
- ❌ **Flat single-color "glow"** (a big transparent circle is not a glow —
  use the radial-gradient SVG).
- ❌ **Touching `"touched": true` layers** or inventing `src` paths —
  standing `CLAUDE.md` rules still apply.
- ❌ **Style roulette across a channel's thumbnails.** Pack consistency is
  the brand; vary the composition, not the pack.

---

## 7 · One-line summary

> **Pick a pack, one focal point, overlap for depth, one light source, glows
> and glass live in SVG assets, cutouts get preprocessed with ImageMagick,
> and anything that looks like the default AI thumbnail gets rebuilt.**
