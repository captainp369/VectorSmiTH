# Example projects

Copy any of these over the project's `scene.json` while `npm run dev` is
running and the canvas updates instantly — then click around: every layer is
selectable, draggable, and editable. That's the point: the AI generates
scenes like these, and you make the final call by hand.

```bash
cp examples/youtube-thumbnail.json scene.json
```

| file | canvas | shows off |
|------|--------|-----------|
| `youtube-thumbnail.json` | 1280×720 | thumbnail anatomy: gradient bg, glow, layered-cards motif, fake terminal, rotated badge |
| `ig-carousel-3-slides.json` | 3 × 1080×1350 | multi-page carousel with a **continuous band** flowing across all three slides |
| `ig-post-starter.json` | 1080×1080 | minimal editorial layout: serif headline, star accent, CTA underline |
| `vox-paper-cutout.json` | 1080×1350 | the [GRAPHIC_PHILOSOPHY](../GRAPHIC_PHILOSOPHY.md) editorial-paper pack, 30 layers: preprocessed photo cutout, torn-paper block, stock ticker, rubber stamp with circular text, paper-money confetti, rocket with dashed trajectory, highlighter bar, grouped caption strips |

`vox-paper-cutout.json` references image files — copy them into your assets
folder first:

```bash
cp examples/media/* assets/
cp examples/vox-paper-cutout.json scene.json
```

(The cutout in `examples/media/trillionaire-papercut.png` was made from a
single ordinary photo: macOS Vision background removal, then the ImageMagick
posterize / paper-border / offset-shadow recipe from GRAPHIC_PHILOSOPHY §5.2.
Source photo: Elon Musk in Los Angeles, 13 April 2024 — Mario Anzuoni /
Reuters, used here as an editorial demo. The torn block, rocket, stamp,
bills, halftone, and arrow are AI-authored SVGs in the same folder.)

Previews of each live in [previews/](previews/) and in the main
[README](../README.md).

They're also handy as few-shot references when prompting the AI — or just ask
Claude Code to "remix the carousel example in my brand colors".
