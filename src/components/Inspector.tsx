import { useRef } from 'react'
import { useEditor } from '../store'
import type { Fill, ImageLayer, Layer } from '../types'
import { FONT_FAMILIES } from '../types'
import { useFonts, uploadFontFile } from '../fonts'
import { loadImage } from '../export'

interface ScrubProps {
  onScrubStart?: () => void
  onScrub?: (v: number) => void
}

function Num({ label, value, onChange, onScrubStart, onScrub, step = 1, min }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
} & ScrubProps) {
  const drag = useRef<{ x: number; v: number; started: boolean } | null>(null)
  const apply = (v: number, fn: (v: number) => void) => {
    if (min !== undefined) v = Math.max(min, v)
    fn(Math.round(v * 100) / 100)
  }
  return (
    <label className="field">
      <span
        className="scrub"
        title="Drag left/right to change"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, v: value, started: false }
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* synthetic/inactive pointer */
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (!d.started) {
            if (Math.abs(dx) < 3) return
            d.started = true
            onScrubStart?.()
          }
          apply(d.v + dx * step, onScrub ?? onChange)
        }}
        onPointerUp={(e) => {
          drag.current = null
          try {
            e.currentTarget.releasePointerCapture(e.pointerId)
          } catch {
            /* not captured */
          }
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {label} ⇹
      </span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) apply(v, onChange)
        }}
      />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isHex = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="color-field">
        <input type="color" value={isHex ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}

function FillEditor({ fill, onChange, scrubFor }: {
  fill: Fill
  onChange: (f: Fill) => void
  scrubFor: (build: (v: number) => Partial<Layer>) => ScrubProps
}) {
  return (
    <>
      <label className="field">
        <span>Fill type</span>
        <select
          value={fill.kind}
          onChange={(e) =>
            onChange(
              e.target.value === 'solid'
                ? { kind: 'solid', color: fill.kind === 'solid' ? fill.color : fill.from }
                : {
                    kind: 'linear-gradient',
                    from: fill.kind === 'solid' ? fill.color : fill.from,
                    to: fill.kind === 'solid' ? '#00000000' : fill.to,
                    angle: fill.kind === 'linear-gradient' ? fill.angle : 180,
                  },
            )
          }
        >
          <option value="solid">Solid</option>
          <option value="linear-gradient">Linear gradient</option>
        </select>
      </label>
      {fill.kind === 'solid' ? (
        <ColorField label="Color" value={fill.color} onChange={(color) => onChange({ ...fill, color })} />
      ) : (
        <>
          <ColorField label="From" value={fill.from} onChange={(from) => onChange({ ...fill, from })} />
          <ColorField label="To" value={fill.to} onChange={(to) => onChange({ ...fill, to })} />
          <Num
            label="Angle"
            value={fill.angle}
            onChange={(angle) => onChange({ ...fill, angle })}
            {...scrubFor((angle) => ({ fill: { ...fill, angle } }) as Partial<Layer>)}
          />
        </>
      )}
    </>
  )
}

export default function Inspector() {
  const scene = useEditor((s) => s.scene)
  const selection = useEditor((s) => s.selection)
  const customFonts = useFonts((s) => s.custom)
  const editor = useEditor
  const fontInput = useRef<HTMLInputElement>(null)

  const layer = selection.length === 1 ? scene.layers.find((l) => l.id === selection[0]) : undefined

  if (!layer) {
    return (
      <div className="panel inspector">
        <div className="panel-title">Inspector</div>
        <div className="empty-hint">
          {selection.length > 1 ? `${selection.length} layers selected` : 'Select a layer to edit its properties.'}
        </div>
      </div>
    )
  }

  const patch = (p: Partial<Layer>) => editor.getState().updateLayer(layer.id, p)
  /** Scrub = live transient updates bracketed by one undo checkpoint. */
  const scrubFor = (build: (v: number) => Partial<Layer>): ScrubProps => ({
    onScrubStart: () => editor.getState().checkpoint(),
    onScrub: (v) => editor.getState().updateLayer(layer.id, build(v), { transient: true }),
  })

  const knownFont =
    FONT_FAMILIES.includes(layer.type === 'text' ? layer.fontFamily : '') ||
    customFonts.includes(layer.type === 'text' ? layer.fontFamily : '')

  return (
    <div className="panel inspector">
      <div className="panel-title">Inspector — {layer.name}</div>
      <div className="inspector-fields">
        <div className="field-row">
          <Num label="X" value={layer.x} onChange={(x) => patch({ x })} {...scrubFor((x) => ({ x }))} />
          <Num label="Y" value={layer.y} onChange={(y) => patch({ y })} {...scrubFor((y) => ({ y }))} />
        </div>
        <div className="field-row">
          <Num label="Rotation" value={layer.rotation} onChange={(rotation) => patch({ rotation })} {...scrubFor((rotation) => ({ rotation }))} />
          <Num
            label="Opacity"
            value={layer.opacity}
            step={0.01}
            min={0}
            onChange={(o) => patch({ opacity: Math.min(1, o) })}
            {...scrubFor((o) => ({ opacity: Math.min(1, Math.max(0, o)) }))}
          />
        </div>

        {(layer.type === 'image' || layer.type === 'rect') && (
          <div className="field-row">
            <Num label="W" value={layer.width} min={1} onChange={(width) => patch({ width } as Partial<Layer>)} {...scrubFor((width) => ({ width }) as Partial<Layer>)} />
            <Num label="H" value={layer.height} min={1} onChange={(height) => patch({ height } as Partial<Layer>)} {...scrubFor((height) => ({ height }) as Partial<Layer>)} />
          </div>
        )}
        {(layer.type === 'image' || layer.type === 'rect') && (
          <Num label="Corner radius" value={layer.cornerRadius ?? 0} min={0} onChange={(cornerRadius) => patch({ cornerRadius } as Partial<Layer>)} {...scrubFor((cornerRadius) => ({ cornerRadius }) as Partial<Layer>)} />
        )}

        {layer.type === 'image' && (
          <>
            {layer.crop ? (
              <>
                <div className="field-row">
                  <Num label="Crop X" value={layer.crop.x} min={0} onChange={(x) => patch({ crop: { ...layer.crop!, x } } as Partial<Layer>)} {...scrubFor((x) => ({ crop: { ...(layer as ImageLayer).crop!, x: Math.max(0, x) } }) as Partial<Layer>)} />
                  <Num label="Crop Y" value={layer.crop.y} min={0} onChange={(y) => patch({ crop: { ...layer.crop!, y } } as Partial<Layer>)} {...scrubFor((y) => ({ crop: { ...(layer as ImageLayer).crop!, y: Math.max(0, y) } }) as Partial<Layer>)} />
                </div>
                <div className="field-row">
                  <Num label="Crop W" value={layer.crop.width} min={1} onChange={(width) => patch({ crop: { ...layer.crop!, width } } as Partial<Layer>)} {...scrubFor((width) => ({ crop: { ...(layer as ImageLayer).crop!, width: Math.max(1, width) } }) as Partial<Layer>)} />
                  <Num label="Crop H" value={layer.crop.height} min={1} onChange={(height) => patch({ crop: { ...layer.crop!, height } } as Partial<Layer>)} {...scrubFor((height) => ({ crop: { ...(layer as ImageLayer).crop!, height: Math.max(1, height) } }) as Partial<Layer>)} />
                </div>
                <button onClick={() => patch({ crop: undefined } as Partial<Layer>)}>Remove crop</button>
              </>
            ) : (
              <button
                onClick={async () => {
                  try {
                    const img = await loadImage(layer.src)
                    patch({ crop: { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight } } as Partial<Layer>)
                  } catch {
                    alert('Could not load the image to crop.')
                  }
                }}
              >
                Crop image
              </button>
            )}
          </>
        )}

        {layer.type === 'circle' && (
          <Num label="Radius" value={layer.radius} min={1} onChange={(radius) => patch({ radius } as Partial<Layer>)} {...scrubFor((radius) => ({ radius }) as Partial<Layer>)} />
        )}

        {layer.type === 'polygon' && (
          <div className="field-row">
            <Num label="Sides" value={layer.sides} min={3} onChange={(sides) => patch({ sides: Math.max(3, Math.round(sides)) } as Partial<Layer>)} />
            <Num label="Radius" value={layer.radius} min={1} onChange={(radius) => patch({ radius } as Partial<Layer>)} {...scrubFor((radius) => ({ radius }) as Partial<Layer>)} />
          </div>
        )}

        {layer.type === 'star' && (
          <>
            <Num label="Points" value={layer.numPoints} min={3} onChange={(numPoints) => patch({ numPoints: Math.max(3, Math.round(numPoints)) } as Partial<Layer>)} />
            <div className="field-row">
              <Num label="Inner radius" value={layer.innerRadius} min={1} onChange={(innerRadius) => patch({ innerRadius } as Partial<Layer>)} {...scrubFor((innerRadius) => ({ innerRadius }) as Partial<Layer>)} />
              <Num label="Outer radius" value={layer.outerRadius} min={2} onChange={(outerRadius) => patch({ outerRadius } as Partial<Layer>)} {...scrubFor((outerRadius) => ({ outerRadius }) as Partial<Layer>)} />
            </div>
          </>
        )}

        {layer.type === 'text' && (
          <>
            <label className="field">
              <span>Text</span>
              <textarea
                rows={3}
                value={layer.text}
                onChange={(e) => patch({ text: e.target.value } as Partial<Layer>)}
              />
            </label>
            <label className="field">
              <span>Font</span>
              <select
                value={knownFont ? layer.fontFamily : '__current__'}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__upload__') {
                    fontInput.current?.click()
                  } else if (v === '__system__') {
                    const name = window.prompt('Font family installed on your system (e.g. "SF Pro Display"):')
                    if (name?.trim()) patch({ fontFamily: name.trim() } as Partial<Layer>)
                  } else if (v !== '__current__') {
                    patch({ fontFamily: v } as Partial<Layer>)
                  }
                }}
              >
                {!knownFont && <option value="__current__">{layer.fontFamily}</option>}
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
                {customFonts.length > 0 && (
                  <optgroup label="Custom fonts">
                    {customFonts.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="More">
                  <option value="__upload__">Upload font file (.ttf/.otf/.woff)…</option>
                  <option value="__system__">Type a system font name…</option>
                </optgroup>
              </select>
            </label>
            <input
              ref={fontInput}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const family = await uploadFontFile(file)
                  patch({ fontFamily: family } as Partial<Layer>)
                } catch {
                  alert('Could not load that font file.')
                }
              }}
            />
            <div className="field-row">
              <Num label="Size" value={layer.fontSize} min={4} onChange={(fontSize) => patch({ fontSize } as Partial<Layer>)} {...scrubFor((fontSize) => ({ fontSize: Math.max(4, fontSize) }) as Partial<Layer>)} />
              <label className="field">
                <span>Weight</span>
                <select value={layer.fontWeight} onChange={(e) => patch({ fontWeight: e.target.value } as Partial<Layer>)}>
                  {['normal', 'bold', '400', '500', '600', '700', '800', '900'].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Align</span>
                <select value={layer.align} onChange={(e) => patch({ align: e.target.value as 'left' } as Partial<Layer>)}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <Num label="Line height" value={layer.lineHeight} step={0.05} min={0.5} onChange={(lineHeight) => patch({ lineHeight } as Partial<Layer>)} {...scrubFor((lineHeight) => ({ lineHeight: Math.max(0.5, lineHeight) }) as Partial<Layer>)} />
            </div>
            <div className="field-row">
              <Num label="Letter spacing" value={layer.letterSpacing ?? 0} step={0.5} onChange={(letterSpacing) => patch({ letterSpacing } as Partial<Layer>)} {...scrubFor((letterSpacing) => ({ letterSpacing }) as Partial<Layer>)} />
              <Num label="Box width" value={layer.width} min={10} onChange={(width) => patch({ width } as Partial<Layer>)} {...scrubFor((width) => ({ width: Math.max(10, width) }) as Partial<Layer>)} />
            </div>
            <ColorField label="Color" value={layer.fill} onChange={(fill) => patch({ fill } as Partial<Layer>)} />
            <div className="field-row">
              <ColorField
                label="Border"
                value={layer.stroke ?? '#000000'}
                onChange={(stroke) => patch({ stroke, strokeWidth: layer.strokeWidth || 1 } as Partial<Layer>)}
              />
              <Num
                label="Border width"
                value={layer.strokeWidth ?? 0}
                min={0}
                onChange={(strokeWidth) => patch({ strokeWidth, stroke: layer.stroke ?? '#000000' } as Partial<Layer>)}
                {...scrubFor((strokeWidth) => ({ strokeWidth: Math.max(0, strokeWidth), stroke: (layer.stroke ?? '#000000') }) as Partial<Layer>)}
              />
            </div>
          </>
        )}

        {(layer.type === 'rect' || layer.type === 'circle' || layer.type === 'polygon' || layer.type === 'star') && (
          <FillEditor fill={layer.fill} onChange={(fill) => patch({ fill } as Partial<Layer>)} scrubFor={scrubFor} />
        )}

        {layer.type === 'line' && (
          <>
            <ColorField label="Stroke" value={layer.stroke} onChange={(stroke) => patch({ stroke } as Partial<Layer>)} />
            <Num label="Stroke width" value={layer.strokeWidth} min={0.5} onChange={(strokeWidth) => patch({ strokeWidth } as Partial<Layer>)} {...scrubFor((strokeWidth) => ({ strokeWidth: Math.max(0.5, strokeWidth) }) as Partial<Layer>)} />
          </>
        )}

        {layer.type === 'image' && (
          <label className="field">
            <span>Source</span>
            <input type="text" value={layer.src.slice(0, 80)} readOnly />
          </label>
        )}
      </div>
    </div>
  )
}
