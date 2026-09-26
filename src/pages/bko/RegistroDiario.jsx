import { useState } from 'react'
import { useBkoData } from '../../lib/BkoDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitRelatorio } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

const COLUMNS = [
  { key: 'date', label: 'Quando', width: '1.5fr' },
  { key: 'reagendamentos', label: 'Reagendamentos', width: '1fr', align: 'right' },
  { key: 'contestacoes', label: 'Contestações', width: '1fr', align: 'right' },
  { key: 'faturas', label: 'Faturas', width: '1fr', align: 'right' },
]

const CAMPOS = [
  { key: 'reagendamentos', label: 'Reagendamentos feitos' },
  { key: 'contestacoes', label: 'Contestações feitas' },
  { key: 'faturas', label: 'Faturas' },
]

export default function RegistroDiario() {
  const { dailyReports, loading, reload } = useBkoData()
  const { toast, showToast } = useToast()
  const [valores, setValores] = useState({ reagendamentos: '', contestacoes: '', faturas: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const n = (k) => Math.max(parseInt(valores[k], 10) || 0, 0)
    const dados = { reagendamentos: n('reagendamentos'), contestacoes: n('contestacoes'), faturas: n('faturas') }
    if (dados.reagendamentos + dados.contestacoes + dados.faturas <= 0) {
      showToast('Preencha pelo menos um dos campos.', 'error')
      return
    }
    setSaving(true)
    try {
      await submitRelatorio(dados)
      setValores({ reagendamentos: '', contestacoes: '', faturas: '' })
      showToast('Relatório enviado.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const rows = dailyReports.map((r) => ({
    key: r.id,
    date: fmtDateTime(r.created_at),
    reagendamentos: r.reagendamentos || '—',
    contestacoes: r.contestacoes || '—',
    faturas: r.faturas || '—',
  }))

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Relatório"
        hint="Preencha só o que você fez — não precisa preencher os três. Reagendamentos e faturas contam na hora."
      />

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CAMPOS.map((c) => (
            <div key={c.key}>
              <label className="field-label">{c.label}</label>
              <input
                type="number"
                min="0"
                className="field-input"
                placeholder="0"
                value={valores[c.key]}
                onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button type="submit" className="btn-primary self-start" disabled={saving}>
          {saving ? 'Enviando…' : 'Enviar relatório'}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-ink">Meus envios</span>
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable columns={COLUMNS} rows={rows} />
        )}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
