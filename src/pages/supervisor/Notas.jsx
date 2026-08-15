import { useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { addNote, deleteNote } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

export default function Notas() {
  const { team, notes, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [userId, setUserId] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!userId || !text.trim()) return
    setSaving(true)
    try {
      await addNote(userId, text.trim())
      setText('')
      showToast('Nota adicionada.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao adicionar nota.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await deleteNote(toDelete.id)
      showToast('Nota removida.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao remover nota.', 'error')
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Notas administrativas" hint="Visíveis apenas para o BKO relacionado" />

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-6 md:flex-row md:items-end">
        <div className="flex-1">
          <Field label="BKO">
            <select className="field-input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Selecione…</option>
              {team.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex-[2]">
          <Field label="Nota">
            <input className="field-input" placeholder="Ex: Bater a meta de contestação até sexta-feira." value={text} onChange={(e) => setText(e.target.value)} required />
          </Field>
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Adicionar nota'}</button>
      </form>

      <div className="flex flex-col gap-3">
        {loading && <p className="text-sm text-muted">Carregando…</p>}
        {!loading && notes.length === 0 && <p className="text-sm text-muted">Nenhuma nota registrada ainda.</p>}
        {notes.map((n) => (
          <div key={n.id} className="card flex items-start justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{n.profiles?.name || 'BKO'}</span>
                <span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-label">{n.note}</p>
            </div>
            <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setToDelete(n)}>Excluir</button>
          </div>
        ))}
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Excluir nota?"
          message="Essa ação não pode ser desfeita."
          confirmLabel="Excluir"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}
