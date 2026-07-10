import { useState } from 'react'
import { useEditor } from '../store'

/** Page strip for multi-canvas projects (carousels, variants, …). */
export default function PagesBar() {
  const pages = useEditor((s) => s.project.pages)
  const activePage = useEditor((s) => s.activePage)
  const editor = useEditor
  const [renaming, setRenaming] = useState<number | null>(null)

  return (
    <div className="pages-bar">
      <span className="pages-label">Pages</span>
      {pages.map((p, i) => (
        <div
          key={p.id}
          className={`page-tab ${i === activePage ? 'active' : ''}`}
          onClick={() => editor.getState().setActivePage(i)}
          onDoubleClick={() => setRenaming(i)}
          title={`${p.name} — ${p.width}×${p.height}`}
        >
          {renaming === i ? (
            <input
              autoFocus
              defaultValue={p.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                editor.getState().renamePage(i, e.target.value.trim() || p.name)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span>{p.name}</span>
          )}
          {pages.length > 1 && i === activePage && (
            <button
              className="page-close"
              title="Delete page"
              onClick={(e) => {
                e.stopPropagation()
                if (p.layers.length === 0 || confirm(`Delete "${p.name}" and its ${p.layers.length} layer(s)?`)) {
                  editor.getState().removePage(i)
                }
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button title="Add empty page" onClick={() => editor.getState().addPage(false)}>+ Page</button>
      <button title="Duplicate current page (handy for carousels)" onClick={() => editor.getState().addPage(true)}>⧉ Duplicate</button>
    </div>
  )
}
