import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import ProgressBar from '../../components/ui/ProgressBar'
import StatusBadge from '../../components/ui/StatusBadge'
import { pct } from '../../lib/helpers'

export default function BkoContestacoes() {
  const { performance, loading } = useBkoData()
  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  const p = pct(performance.contestations_done, performance.contestation_goal)

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite
        label="Contestações"
        value={`${performance.contestations_done} / ${performance.contestation_goal}`}
        sub={`${p}% da meta atingida`}
        minWidth={300}
      />
      <div className="card flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <span className="stat-label">Progresso</span>
          <StatusBadge pct={p} />
        </div>
        <ProgressBar pct={p} />
        <span className="text-sm text-muted">{performance.contestations_done} de {performance.contestation_goal} contestações realizadas no período.</span>
      </div>
    </div>
  )
}
