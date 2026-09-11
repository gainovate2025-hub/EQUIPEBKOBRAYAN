import { useBkoData } from '../../lib/BkoDataContext'
import { useAuth } from '../../lib/AuthContext'
import { HeroCardRed, HeroCardWhite } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import { fmtDateTime, fmtMoney, pct } from '../../lib/helpers'

export default function BkoDashboard() {
  const { performance, notes, contestacoes, loading, error } = useBkoData()
  const { contestacaoLabel } = useAuth()

  if (loading) return <p className="text-sm text-muted">Carregando seu painel…</p>
  if (error) return <p className="text-sm font-medium text-bad-text">{error}</p>
  if (!performance) return null

  const pctCont = pct(performance.contestations_done, performance.contestation_goal)
  const pctResched = pct(performance.rescheduling_done, performance.rescheduling_goal)
  const pendentes = contestacoes.filter((c) => c.status === 'pendente').length

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-4">
        <HeroCardRed
          label="Meta"
          value={performance.contestation_goal}
          sub={`${performance.contestations_done} / ${performance.contestation_goal} ${contestacaoLabel.toLowerCase()} autorizadas`}
          pct={pctCont}
        />
        <HeroCardWhite label="Comissão" value={fmtMoney(performance.commission)} sub="Comissão atual" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Comissão" value={fmtMoney(performance.commission)} />
        <StatCard
          label={contestacaoLabel}
          value={`${performance.contestations_done} / ${performance.contestation_goal}`}
          sub={pendentes > 0 ? `${pendentes} pendente(s) de autorização` : `${pctCont}% da meta`}
          pct={pctCont}
          showStatus
        />
        <StatCard
          label="Reagendamento"
          value={`${performance.rescheduling_done} / ${performance.rescheduling_goal}`}
          sub={`${pctResched}% da meta`}
          pct={pctResched}
          showStatus
        />
      </div>

      <div className="card p-5">
        <span className="stat-label">Objetivo</span>
        <p className="mt-2 text-sm text-ink">{performance.objective || 'Nenhum objetivo definido ainda.'}</p>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading title="Notas do Supervisor" />
        {notes.length === 0 && <p className="text-sm text-muted">Nenhuma nota registrada ainda.</p>}
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <div key={n.id} className="card p-4">
              <span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span>
              <p className="mt-1 text-sm text-ink">{n.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
