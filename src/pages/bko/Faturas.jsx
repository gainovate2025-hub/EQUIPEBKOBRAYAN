import { useState } from 'react'
import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import DataTable from '../../components/ui/DataTable'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitRelatorio } from '../../lib/api'
import { fmtDateTime, fmtMoney } from '../../lib/helpers'

const COLUMNS = [
  { key: 'date', label: 'Quando', width: '1.5fr' },
  { key: 'valor', label: 'Faturas', width: '1fr', align: 'right' },
]

export default function BkoFaturas() {
  const { performance, dailyReports, loading, reload } = useBkoData()
  const { toast, showToast } = useToast()
  const [valor, setValor] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const n = Math.max(parseInt(valor, 10) || 0, 0)
    if (n <= 0) {
      showToast('Informe uma quantidade.', 'error')
      return
    }
    setSaving(true)
    try {
      await submitRelatorio({ faturas: n })
      setValor('')
      showToast('Faturas enviadas — contam na hora.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  const rows = dailyReports
    .filter((r) => r.faturas > 0)
    .map((r) => ({ key: r.id, date: fmtDateTime(r.created_at), valor: r.faturas }))

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite label="Faturas" value={performance.faturas_done ?? 0} sub="Contam na hora · R$ 2 cada" minWidth={300} />

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="field-label">Faturas agora</label>
          <input
            type="number"
            min="0"
            className="field-input"
            placeholder="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      <div className="card p-5 text-sm text-muted">
        Cada fatura soma <strong>R$ 2,00</strong> na sua comissão. Total atual: {fmtMoney(performance.commission)}.
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-ink">Meus envios</span>
        <DataTable columns={COLUMNS} rows={rows} />
      </div>

      <Toast toast={toast} />
    </div>
  )
}
