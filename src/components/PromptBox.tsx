import { useState } from 'react'
import { useEditor } from '../store'
import { DEFAULT_MODEL, loadAISettings, runPrompt, saveAISettings } from '../ai'

export default function PromptBox() {
  const editor = useEditor
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(loadAISettings)

  const submit = async () => {
    const text = prompt.trim()
    if (!text || status === 'working') return
    if (!settings.apiKey) {
      setSettingsOpen(true)
      setError('Add an Anthropic API key first — or skip the key entirely and just ask Claude Code to edit scene.json in this project; the canvas updates live.')
      setStatus('error')
      return
    }
    setStatus('working')
    setError('')
    try {
      const next = await runPrompt(text, editor.getState().scene, settings)
      editor.getState().replaceScene(next) // recorded in history — undo restores the pre-AI scene
      setPrompt('')
      setStatus('idle')
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
    }
  }

  return (
    <div className="prompt-box">
      <textarea
        rows={2}
        placeholder='Describe the graphic — e.g. "YouTube thumbnail from this photo, bold Thai headline top-left, dark gradient behind the text" — or press ⌘⏎'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="prompt-actions">
        <button className="primary" onClick={submit} disabled={status === 'working'}>
          {status === 'working' ? 'Designing…' : 'Generate'}
        </button>
        <button onClick={() => setSettingsOpen(!settingsOpen)} title="AI settings">⚙</button>
      </div>
      {status === 'error' && <div className="prompt-error">{error}</div>}
      {settingsOpen && (
        <div className="prompt-settings">
          <label>
            Anthropic API key
            <input
              type="password"
              value={settings.apiKey}
              placeholder="sk-ant-…"
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            />
          </label>
          <label>
            Model
            <input
              type="text"
              value={settings.model}
              placeholder={DEFAULT_MODEL}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
          </label>
          <button
            onClick={() => {
              saveAISettings(settings)
              setSettingsOpen(false)
              if (status === 'error') setStatus('idle')
            }}
          >
            Save
          </button>
          <p className="hint">
            Key is stored only in this browser (localStorage). No key? Ask Claude Code to edit{' '}
            <code>scene.json</code> instead — the canvas follows the file live.
          </p>
        </div>
      )}
    </div>
  )
}
