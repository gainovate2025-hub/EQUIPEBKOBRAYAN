import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardRed, HeroCardWhite } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import { fmtDateTime, fmtMoney, pct } from '../../lib/helpers'

export default function BkoDashboard() {
  const { performance, notes, loading, error } = useBkoData()

  if (loading) return <p className="text-sm text-muted">Carregando seu painel…</p>
  if (error) return <p className="text-sm font-medium text-brand-700">{error}</p>
  if (!performance) return null

  const pctCont = pct(performance.contestations_done, performance.contestation_goal)
  const pctResched = pct(performance.rescheduling_done, performance.rescheduling_goal)

  return (
    <div className="flex flex-col gap-11">
      <div className="flex flex-wrap gap-4">
        <HeroCardRed
          label="Meta"
          value={performance.contestation_goal}
          sub={`${performance.contestations_done} / ${performance.contestation_goal} contestações`}
          pct={pctCont}
        />
        <HeroCardWhite label="Comissão" value={fmtMoney(performance.commission)} sub="Comissão atual" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Comissão" value={fmtMoney(performance.commission)} delay={0.14} />
        <StatCard
          label="Contestação"
          value={`${performance.contestations_done} / ${performance.contestation_goal}`}
          sub={`${pctCont}% da meta`}
          pct={pctCont}
          delay={0.22}
          showStatus
        />
        <StatCard
          label="Reagendamento"
          value={`${performance.rescheduling_done} / ${performance.rescheduling_goal}`}
          sub={`${pctResched}% da meta`}
          pct={pctResched}
          delay={0.3}
          showStatus
        />
      </div>

      <div className="card p-6">
        <span className="stat-label">Objetivo</span>
        <p className="mt-3 text-base leading-relaxed">{performance.objective || 'Nenhum objetivo definido ainda.'}</p>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeading title="Notas do Supervisor" />
        {notes.length === 0 && <p className="text-sm text-muted">Nenhuma nota registrada ainda.</p>}
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} className="card p-5">
              <span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span>
              <p className="mt-1 text-sm text-label">{n.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
