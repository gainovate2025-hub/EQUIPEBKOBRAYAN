import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import { fmtMoney, pct } from '../../lib/helpers'

// Simplificado em 05/11/2026 — sem meta/pendência de contestação (tirado
// do site). Mostra só as contagens (contestação/reagendamento/fatura) e a
// comissão atual, sem fila de aprovação.
export default function BkoDashboard() {
  const { performance, loading, error } = useBkoData()

  if (loading) return <p className="text-sm text-muted">Carregando seu painel…</p>
  if (error) return <p className="text-sm font-medium text-bad-text">{error}</p>
  if (!performance) return null

  const pctResched = pct(performance.rescheduling_done, performance.rescheduling_goal)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-4">
        <HeroCardWhite label="Comissão" value={fmtMoney(performance.commission)} sub="Comissão atual" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Comissão" value={fmtMoney(performance.commission)} />
        <StatCard label="Contestações" value={performance.contestations_done ?? 0} />
        <StatCard
          label="Reagendamento"
          value={`${performance.rescheduling_done} / ${performance.rescheduling_goal}`}
          sub={`${pctResched}% da meta`}
          pct={pctResched}
          showStatus
        />
        <StatCard label="Faturas" value={performance.faturas_done ?? 0} />
      </div>
    </div>
  )
}
