import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import { fmtMoney } from '../../lib/helpers'

// Simplificado em 05/11/2026: comissão deixou de somar sozinha (telas de
// registro diário removidas); mostra as contagens (contestação/
// reagendamento/fatura) e a comissão atual, ajustada manualmente pelo
// supervisor.
export default function BkoComissao() {
  const { performance, loading } = useBkoData()
  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite label="Minha comissão" value={fmtMoney(performance.commission)} sub="Ajustes manuais só pelo seu supervisor" minWidth={300} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Contestações feitas" value={performance.contestations_done ?? 0} />
        <StatCard label="Reagendamentos feitos" value={performance.rescheduling_done ?? 0} />
        <StatCard label="Faturas feitas" value={performance.faturas_done ?? 0} />
      </div>
    </div>
  )
}
