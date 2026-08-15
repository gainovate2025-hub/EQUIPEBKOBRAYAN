import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import { fmtMoney } from '../../lib/helpers'

export default function BkoComissao() {
  const { performance, loading } = useBkoData()
  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite label="Minha comissão" value={fmtMoney(performance.commission)} sub="Valor definido pelo supervisor" minWidth={300} />
      <div className="card p-6 text-sm text-muted">
        O valor da sua comissão é definido pelo supervisor e atualizado automaticamente aqui assim que houver alteração.
      </div>
    </div>
  )
}
