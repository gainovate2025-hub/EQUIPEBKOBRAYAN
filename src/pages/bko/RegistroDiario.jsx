import { useState } from 'react'
import { useBkoData } from '../../lib/BkoDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitDailyReport } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

const COLUMNS = [
  { key: 'date', label: 'Quando', width: '1.5fr' },
  { key: 'reagendamentos', label: 'Reagendamentos', width: '1fr', align: 'right' },
]

export default function RegistroDiario() {
  const { dailyReports, loading, reload } = useBkoData()
  const { toast, showToast } = useToast()
  const [reagendamentos, setReagendamentos] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const r = parseInt(reagendamentos, 10) || 0
    if (r <= 0) {
      showToast('Informe uma quantidade.', 'error')
      return
    }
    setSaving(true)
    try {
      await submitDailyReport(r)
      setReagendamentos('')
      showToast('Registro enviado — seus totais já foram atualizados.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const rows = dailyReports
    .filter((r) => r.reagendamentos > 0)
    .map((r) => ({ key: r.id, date: fmtDateTime(r.created_at), reagendamentos: r.reagendamentos }))

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Registro diário" hint="Some ao seu total de reagendamentos — não apaga nem substitui nada" />

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="field-label">Reagendamentos feitos hoje</label>
          <input
            type="number"
            min="0"
            className="field-input"
            placeholder="0"
            value={reagendamentos}
            onChange={(e) => setReagendamentos(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Enviando…' : 'Enviar registro'}
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
