import { useState } from 'react'
import Modal from './ui/Modal'
import Field from './ui/Field'
import { useAuth } from '../lib/AuthContext'
import { addNote, updatePassword, updatePerformance, updateProfile } from '../lib/api'

export default function EditBkoModal({ bko, onClose, onSaved, showToast }) {
  const { contestacaoLabel } = useAuth()
  const perf = bko.performance || {}
  const [form, setForm] = useState({
    name: bko.name,
    username: bko.username,
    password: '',
    contestation_goal: perf.contestation_goal ?? 0,
    contestations_done: perf.contestations_done ?? 0,
    rescheduling_goal: perf.rescheduling_goal ?? 0,
    rescheduling_done: perf.rescheduling_done ?? 0,
    commission: perf.commission ?? 0,
    objective: perf.objective ?? '',
    newNote: '',
  })
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(bko.id, { name: form.name, username: form.username })
      await updatePerformance(bko.id, {
        contestation_goal: Number(form.contestation_goal) || 0,
        contestations_done: Number(form.contestations_done) || 0,
        rescheduling_goal: Number(form.rescheduling_goal) || 0,
        rescheduling_done: Number(form.rescheduling_done) || 0,
        commission: Number(form.commission) || 0,
        objective: form.objective,
      })
      if (form.password.trim()) {
        await updatePassword(bko.id, form.password.trim())
      }
      if (form.newNote.trim()) {
        await addNote(bko.id, form.newNote.trim())
      }
      showToast(`${form.name} atualizado com sucesso.`)
      onSaved()
      onClose()
    } catch (err) {
      showToast(err.message || 'Falha ao salvar alterações.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Editar — ${bko.name}`} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome do BKO">
            <input className="field-input" value={form.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label="Usuário">
            <input className="field-input" value={form.username} onChange={(e) => update('username', e.target.value)} required />
          </Field>
          <Field label="Nova senha (opcional)">
            <input type="password" className="field-input" placeholder="deixe em branco para manter" value={form.password} onChange={(e) => update('password', e.target.value)} />
          </Field>
          <Field label="Comissão (R$)">
            <input type="number" step="0.01" min="0" className="field-input" value={form.commission} onChange={(e) => update('commission', e.target.value)} />
          </Field>
          <Field label={`Meta de ${contestacaoLabel.toLowerCase()}`}>
            <input type="number" min="0" className="field-input" value={form.contestation_goal} onChange={(e) => update('contestation_goal', e.target.value)} />
          </Field>
          <Field label={`${contestacaoLabel} realizadas`}>
            <input type="number" min="0" className="field-input" value={form.contestations_done} onChange={(e) => update('contestations_done', e.target.value)} />
          </Field>
          <Field label="Meta de reagendamentos">
            <input type="number" min="0" className="field-input" value={form.rescheduling_goal} onChange={(e) => update('rescheduling_goal', e.target.value)} />
          </Field>
          <Field label="Reagendamentos realizados">
            <input type="number" min="0" className="field-input" value={form.rescheduling_done} onChange={(e) => update('rescheduling_done', e.target.value)} />
          </Field>
        </div>

        <Field label="Objetivo">
          <textarea className="field-input" rows={2} value={form.objective} onChange={(e) => update('objective', e.target.value)} />
        </Field>

        <Field label="Nova nota (opcional)">
          <textarea className="field-input" rows={2} placeholder="Ex: Bater a meta de contestação até sexta-feira." value={form.newNote} onChange={(e) => update('newNote', e.target.value)} />
        </Field>

        <div className="mt-1 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        </div>
      </form>
    </Modal>
  )
}
