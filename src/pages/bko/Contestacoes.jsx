import { useState } from 'react'
import { useBkoData } from '../../lib/BkoDataContext'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import StatCard from '../../components/ui/StatCard'
import ContestacaoStatusBadge from '../../components/ui/ContestacaoStatusBadge'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { submitContestacao } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

export default function BkoContestacoes() {
  const { contestacoes, performance, loading, reload } = useBkoData()
  const { contestacaoLabel } = useAuth()
  const { toast, showToast } = useToast()
  const [custCode, setCustCode] = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!custCode.trim()) {
      showToast('Informe o Cust Code.', 'error')
      return
    }
    setSaving(true)
    try {
      await submitContestacao(custCode.trim(), observacao.trim())
      setCustCode('')
      setObservacao('')
      showToast('Enviado — aguardando autorização do supervisor.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const pendentes = contestacoes.filter((c) => c.status === 'pendente').length
  const autorizadas = contestacoes.filter((c) => c.status === 'autorizada').length
  const recusadas = contestacoes.filter((c) => c.status === 'recusada').length

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title={contestacaoLabel} hint="Toda contestação enviada fica pendente até o supervisor autorizar" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Enviadas" value={contestacoes.length} />
        <StatCard label="Pendentes" value={pendentes} />
        <StatCard label="Autorizadas" value={autorizadas} sub={`Meta: ${performance?.contestation_goal ?? 0}`} />
        <StatCard label="Recusadas" value={recusadas} />
      </div>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
        <span className="text-sm font-semibold text-ink">Nova {contestacaoLabel.toLowerCase()}</span>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <label className="field-label">Cust Code</label>
            <input className="field-input" placeholder="Ex: CC-10293" value={custCode} onChange={(e) => setCustCode(e.target.value)} />
          </div>
          <div className="flex-[2]">
            <label className="field-label">Observação (opcional)</label>
            <input className="field-input" placeholder="Detalhe o caso para o supervisor" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="btn-primary self-start" disabled={saving}>
          {saving ? 'Enviando…' : 'Enviar para aprovação'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink">Minhas {contestacaoLabel.toLowerCase()}</span>
        {loading && <p className="text-sm text-muted">Carregando…</p>}
        {!loading && contestacoes.length === 0 && (
          <div className="card p-6 text-center text-sm text-muted">Nenhuma enviada ainda.</div>
        )}
        {contestacoes.map((c, i) => (
          <div key={c.id} className="card flex items-start gap-3 p-4">
            <span className="mt-0.5 text-xs font-medium text-subtle">{i + 1}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <code className="rounded bg-paper px-1.5 py-0.5 text-xs">{c.cust_code}</code>
                <ContestacaoStatusBadge status={c.status} />
              </div>
              {c.observacao && <p className="mt-1 text-xs text-muted">{c.observacao}</p>}
              {c.status === 'recusada' && c.motivo_recusa && (
                <p className="mt-1 text-xs text-bad-text">Motivo da recusa: {c.motivo_recusa}</p>
              )}
              <p className="mt-1 text-[11px] text-subtle">Enviado em {fmtDateTime(c.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
