import { useEffect, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { updatePerformance } from '../../lib/api'

export default function Objetivos() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    const next = {}
    team.forEach((b) => { next[b.id] = b.performance?.objective || '' })
    setDrafts(next)
  }, [team])

  async function handleSave(bko) {
    setSaving(bko.id)
    try {
      await updatePerformance(bko.id, { objective: drafts[bko.id] || '' })
      showToast(`Objetivo de ${bko.name} atualizado.`)
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao salvar objetivo.', 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Objetivo de cada BKO" hint="Definido pelo supervisor, visível para o BKO no próprio painel" />
      {loading && <p className="text-sm text-muted">Carregando…</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {team.map((b) => {
          const dirty = (drafts[b.id] || '') !== (b.performance?.objective || '')
          return (
            <div key={b.id} className="card flex flex-col gap-3 p-6">
              <span className="font-semibold">{b.name}</span>
              <textarea
                className="field-input"
                rows={3}
                placeholder="Ex: Atingir 120 contestações"
                value={drafts[b.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
              />
              <button
                type="button"
                className="btn-primary self-start"
                style={{ padding: '8px 18px', fontSize: 13 }}
                disabled={!dirty || saving === b.id}
                onClick={() => handleSave(b)}
              >
                {saving === b.id ? 'Salvando…' : 'Salvar objetivo'}
              </button>
            </div>
          )
        })}
      </div>
      <Toast toast={toast} />
    </div>
  )
}
