import { useEffect, useRef, useState } from 'react'

export default function InlineEditableNumber({ value, format, onCommit, step = '1' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commit() {
    const num = parseFloat(draft)
    if (!Number.isNaN(num) && num !== value) onCommit(num)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={step}
        value={draft}
        className="field-input"
        style={{ width: 110, padding: '6px 10px', textAlign: 'right' }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-right hover:bg-brand-50 hover:text-brand-700"
      onClick={() => { setDraft(value); setEditing(true) }}
      title="Clique para editar"
    >
      {format ? format(value) : value} <span className="text-muted">✎</span>
    </button>
  )
}
