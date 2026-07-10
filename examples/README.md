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

They're also handy as few-shot references when prompting the AI — or just ask
Claude Code to "remix the carousel example in my brand colors".
