import { useEditor } from '../store'
import type { Fill, Layer } from '../types'
import { FONT_FAMILIES } from '../types'

function Num({ label, value, onChange, step = 1, min }: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
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

function FillEditor({ fill, onChange }: { fill: Fill; onChange: (f: Fill) => void }) {
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
          <Num label="Angle" value={fill.angle} onChange={(angle) => onChange({ ...fill, angle })} />
        </>
      )}
    </>
  )
}

export default function Inspector() {
  const scene = useEditor((s) => s.scene)
  const selection = useEditor((s) => s.selection)
  const editor = useEditor

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

  return (
    <div className="panel inspector">
      <div className="panel-title">Inspector — {layer.name}</div>
      <div className="inspector-fields">
        <div className="field-row">
          <Num label="X" value={layer.x} onChange={(x) => patch({ x })} />
          <Num label="Y" value={layer.y} onChange={(y) => patch({ y })} />
        </div>
        <div className="field-row">
          <Num label="Rotation" value={layer.rotation} onChange={(rotation) => patch({ rotation })} />
          <Num label="Opacity" value={layer.opacity} step={0.05} min={0} onChange={(opacity) => patch({ opacity: Math.min(1, Math.max(0, opacity)) })} />
        </div>

        {(layer.type === 'image' || layer.type === 'rect') && (
          <div className="field-row">
            <Num label="W" value={layer.width} min={1} onChange={(width) => patch({ width } as Partial<Layer>)} />
            <Num label="H" value={layer.height} min={1} onChange={(height) => patch({ height } as Partial<Layer>)} />
          </div>
        )}
        {(layer.type === 'image' || layer.type === 'rect') && (
          <Num label="Corner radius" value={layer.cornerRadius ?? 0} min={0} onChange={(cornerRadius) => patch({ cornerRadius } as Partial<Layer>)} />
        )}

        {layer.type === 'circle' && (
          <Num label="Radius" value={layer.radius} min={1} onChange={(radius) => patch({ radius } as Partial<Layer>)} />
        )}

        {layer.type === 'polygon' && (
          <div className="field-row">
            <Num label="Sides" value={layer.sides} min={3} onChange={(sides) => patch({ sides: Math.max(3, Math.round(sides)) } as Partial<Layer>)} />
            <Num label="Radius" value={layer.radius} min={1} onChange={(radius) => patch({ radius } as Partial<Layer>)} />
          </div>
        )}

        {layer.type === 'star' && (
          <>
            <Num label="Points" value={layer.numPoints} min={3} onChange={(numPoints) => patch({ numPoints: Math.max(3, Math.round(numPoints)) } as Partial<Layer>)} />
            <div className="field-row">
              <Num label="Inner radius" value={layer.innerRadius} min={1} onChange={(innerRadius) => patch({ innerRadius } as Partial<Layer>)} />
              <Num label="Outer radius" value={layer.outerRadius} min={2} onChange={(outerRadius) => patch({ outerRadius } as Partial<Layer>)} />
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
              <select value={layer.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value } as Partial<Layer>)}>
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <div className="field-row">
              <Num label="Size" value={layer.fontSize} min={4} onChange={(fontSize) => patch({ fontSize } as Partial<Layer>)} />
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
              <Num label="Line height" value={layer.lineHeight} step={0.05} min={0.5} onChange={(lineHeight) => patch({ lineHeight } as Partial<Layer>)} />
            </div>
            <Num label="Box width" value={layer.width} min={10} onChange={(width) => patch({ width } as Partial<Layer>)} />
            <ColorField label="Color" value={layer.fill} onChange={(fill) => patch({ fill } as Partial<Layer>)} />
          </>
        )}

        {(layer.type === 'rect' || layer.type === 'circle' || layer.type === 'polygon' || layer.type === 'star') && (
          <FillEditor fill={layer.fill} onChange={(fill) => patch({ fill } as Partial<Layer>)} />
        )}

        {layer.type === 'line' && (
          <>
            <ColorField label="Stroke" value={layer.stroke} onChange={(stroke) => patch({ stroke } as Partial<Layer>)} />
            <Num label="Stroke width" value={layer.strokeWidth} min={0.5} onChange={(strokeWidth) => patch({ strokeWidth } as Partial<Layer>)} />
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
