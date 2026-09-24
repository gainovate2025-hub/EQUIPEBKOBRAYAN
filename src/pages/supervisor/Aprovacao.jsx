import { useMemo, useState } from 'react'
import { Check, Copy, ListChecks, X } from 'lucide-react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import StatCard from '../../components/ui/StatCard'
import ContestacaoStatusBadge from '../../components/ui/ContestacaoStatusBadge'
import Modal from '../../components/ui/Modal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { decideContestacao } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

function isToday(iso) {
  const d = new Date(iso)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function withinDays(iso, days) {
  const d = new Date(iso).getTime()
  return d >= Date.now() - days * 86400000
}

// Normaliza um Cust Code pra comparar — tira espaço nas pontas e ignora
// maiúscula/minúscula, sem mexer em pontos/traços (o formato varia).
function normalizarCustCode(v) {
  return String(v || '').trim().toUpperCase()
}

export default function Aprovacao() {
  const { team, contestacoes, loading, reload } = useSupervisorData()
  const { contestacaoLabel } = useAuth()
  const { toast, showToast } = useToast()
  const [statusFilter, setStatusFilter] = useState('pendente')
  const [bkoFilter, setBkoFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [rejecting, setRejecting] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [lote, setLote] = useState(null) // { texto, processando } — modal de aprovar em lote
  const [progressoLote, setProgressoLote] = useState(null) // { feitos, total }

  const stats = useMemo(() => {
    const pendentes = contestacoes.filter((c) => c.status === 'pendente').length
    const autorizadasHoje = contestacoes.filter((c) => c.status === 'autorizada' && isToday(c.decided_at)).length
    const recusadasHoje = contestacoes.filter((c) => c.status === 'recusada' && isToday(c.decided_at)).length
    const totalAutorizado = contestacoes.filter((c) => c.status === 'autorizada').length
    return { pendentes, autorizadasHoje, recusadasHoje, totalAutorizado }
  }, [contestacoes])

  const rows = useMemo(() => {
    return contestacoes.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (bkoFilter && c.user_id !== bkoFilter) return false
      if (periodFilter === 'today' && !isToday(c.created_at)) return false
      if (periodFilter === '7d' && !withinDays(c.created_at, 7)) return false
      if (periodFilter === '30d' && !withinDays(c.created_at, 30)) return false
      return true
    })
  }, [contestacoes, statusFilter, bkoFilter, periodFilter])

  async function handleApprove(id) {
    setBusyId(id)
    try {
      await decideContestacao(id, 'autorizada')
      showToast('Contestação autorizada.')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject() {
    if (!motivo.trim()) {
      showToast('Informe o motivo da recusa.', 'error')
      return
    }
    setBusyId(rejecting.id)
    try {
      await decideContestacao(rejecting.id, 'recusada', motivo.trim())
      showToast('Contestação recusada.')
      setRejecting(null)
      setMotivo('')
      reload()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  // Lista dos códigos colados no lote, já normalizados — recalcula a
  // cada letra digitada só pra mostrar quantos bateram, antes de
  // confirmar.
  const codigosLote = useMemo(() => {
    if (!lote) return []
    return lote.texto
      .split(/[\n,;]+/)
      .map((v) => normalizarCustCode(v))
      .filter(Boolean)
  }, [lote])

  const pendentesBatendoComLote = useMemo(() => {
    if (!lote) return []
    const alvo = new Set(codigosLote)
    return contestacoes.filter((c) => c.status === 'pendente' && alvo.has(normalizarCustCode(c.cust_code)))
  }, [lote, codigosLote, contestacoes])

  async function confirmarLote() {
    const alvo = pendentesBatendoComLote
    if (alvo.length === 0) return
    setLote((l) => ({ ...l, processando: true }))
    setProgressoLote({ feitos: 0, total: alvo.length })
    let falhas = 0
    for (const c of alvo) {
      try {
        await decideContestacao(c.id, 'autorizada')
      } catch {
        falhas += 1
      }
      setProgressoLote((p) => ({ ...p, feitos: p.feitos + 1 }))
    }
    showToast(
      falhas === 0
        ? `${alvo.length} contestação(ões) autorizada(s) em lote.`
        : `${alvo.length - falhas} autorizada(s), ${falhas} falharam.`,
      falhas === 0 ? 'success' : 'error'
    )
    setLote(null)
    setProgressoLote(null)
    reload()
  }

  function copyCode(code) {
    navigator.clipboard?.writeText(code)
    showToast('Cust Code copiado.')
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title={`Aprovação de ${contestacaoLabel}`} hint="Só entra na meta e na comissão depois de autorizada" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pendentes" value={stats.pendentes} />
        <StatCard label="Autorizadas hoje" value={stats.autorizadasHoje} />
        <StatCard label="Recusadas hoje" value={stats.recusadasHoje} />
        <StatCard label="Total autorizado" value={stats.totalAutorizado} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="field-input" style={{ maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todas</option>
          <option value="pendente">Pendentes</option>
          <option value="autorizada">Autorizadas</option>
          <option value="recusada">Recusadas</option>
        </select>
        <select className="field-input" style={{ maxWidth: 200 }} value={bkoFilter} onChange={(e) => setBkoFilter(e.target.value)}>
          <option value="">Todos os BKOs</option>
          {team.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="field-input" style={{ maxWidth: 160 }} value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
          <option value="all">Todo período</option>
          <option value="today">Hoje</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
        </select>
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setLote({ texto: '', processando: false })}>
          <ListChecks size={14} /> Aprovar em lote
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && rows.length === 0 && (
        <div className="card p-8 text-center text-sm text-muted">Nenhum registro com esse filtro.</div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((c, i) => (
          <div key={c.id} className="card flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xs font-medium text-subtle">{i + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{c.profiles?.name || '—'}</span>
                    <ContestacaoStatusBadge status={c.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                    <code className="rounded bg-paper px-1.5 py-0.5 text-xs">{c.cust_code}</code>
                    <button type="button" onClick={() => copyCode(c.cust_code)} className="text-subtle hover:text-ink" title="Copiar">
                      <Copy size={13} />
                    </button>
                  </div>
                  {c.observacao && <p className="mt-1 max-w-lg text-xs text-muted">{c.observacao}</p>}
                  {c.status === 'recusada' && c.motivo_recusa && (
                    <p className="mt-1 text-xs text-bad-text">Motivo: {c.motivo_recusa}</p>
                  )}
                  <p className="mt-1 text-[11px] text-subtle">
                    Enviado em {fmtDateTime(c.created_at)}
                    {c.decided_at && ` · decidido em ${fmtDateTime(c.decided_at)}`}
                  </p>
                </div>
              </div>

              {c.status === 'pendente' && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn-success btn-sm" disabled={busyId === c.id} onClick={() => handleApprove(c.id)}>
                    <Check size={14} /> Autorizar
                  </button>
                  <button type="button" className="btn-danger btn-sm" disabled={busyId === c.id} onClick={() => setRejecting(c)}>
                    <X size={14} /> Recusar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {rejecting && (
        <Modal title={`Recusar contestação — ${rejecting.profiles?.name}`} onClose={() => { setRejecting(null); setMotivo('') }} width={420}>
          <label className="field-label">Motivo da recusa</label>
          <textarea className="field-input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique por que essa contestação está sendo recusada" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setRejecting(null); setMotivo('') }}>Cancelar</button>
            <button type="button" className="btn-danger" disabled={busyId === rejecting.id} onClick={handleReject}>Confirmar recusa</button>
          </div>
        </Modal>
      )}

      {lote && (
        <Modal title="Aprovar em lote" onClose={() => !lote.processando && setLote(null)} width={520}>
          <p className="text-xs text-muted">
            Cola os Cust Codes já aprovados — um por linha (ou separados por vírgula). Só as{' '}
            <strong>contestações pendentes</strong> que baterem com algum código da lista são autorizadas.
          </p>
          <textarea
            className="field-input mt-3"
            rows={8}
            placeholder={'7.2232803\n7.2230866\n7.2232801'}
            value={lote.texto}
            disabled={lote.processando}
            onChange={(e) => setLote((l) => ({ ...l, texto: e.target.value }))}
          />

          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span>{codigosLote.length} código(s) na lista</span>
            <span className={pendentesBatendoComLote.length > 0 ? 'font-semibold text-good-text' : ''}>
              {pendentesBatendoComLote.length} pendente(s) vão ser autorizada(s)
            </span>
          </div>

          {progressoLote && (
            <p className="mt-2 text-xs text-muted">Autorizando {progressoLote.feitos}/{progressoLote.total}…</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={lote.processando} onClick={() => setLote(null)}>Cancelar</button>
            <button
              type="button"
              className="btn-success"
              disabled={lote.processando || pendentesBatendoComLote.length === 0}
              onClick={confirmarLote}
            >
              {lote.processando ? 'Autorizando…' : `Autorizar ${pendentesBatendoComLote.length}`}
            </button>
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  )
}
