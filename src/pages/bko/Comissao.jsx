import { useBkoData } from '../../lib/BkoDataContext'
import { useAuth } from '../../lib/AuthContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import { fmtMoney } from '../../lib/helpers'

export default function BkoComissao() {
  const { performance, loading } = useBkoData()
  const { contestacaoLabel } = useAuth()
  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite label="Minha comissão" value={fmtMoney(performance.commission)} sub="Soma sozinha pelo seu registro diário" minWidth={300} />
      <div className="card p-6 text-sm text-muted">
        R$ 2,00 por {contestacaoLabel.toLowerCase()} + R$ 1,00 por reagendamento — soma automaticamente quando você envia o registro diário. Ajustes manuais só pelo seu supervisor.
      </div>
    </div>
  )
}
