import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useBkoData } from '../../lib/BkoDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import ProgressBar from '../../components/ui/ProgressBar'
import StatusBadge from '../../components/ui/StatusBadge'
import SectionHeading from '../../components/ui/SectionHeading'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos, concluirReagendamentoCaso } from '../../lib/api'
import { pct } from '../../lib/helpers'

export default function BkoReagendamentos() {
  const { profile } = useAuth()
  const { performance, loading } = useBkoData()
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [carregandoCasos, setCarregandoCasos] = useState(true)
  const [concluindoId, setConcluindoId] = useState(null)

  async function carregarCasos() {
    if (!profile?.id) return
    setCarregandoCasos(true)
    try {
      const dados = await fetchReagendamentoCasos({ bkoId: profile.id })
      setCasos(dados)
    } catch (err) {
      showToast(err.message || 'Falha ao carregar casos.', 'error')
    } finally {
      setCarregandoCasos(false)
    }
  }

  useEffect(() => { carregarCasos() }, [profile?.id])

  async function concluir(id) {
    setConcluindoId(id)
    try {
      await concluirReagendamentoCaso(id)
      showToast('Caso concluído — já contou na meta e na comissão.')
      await carregarCasos()
    } catch (err) {
      showToast(err.message || 'Falha ao concluir.', 'error')
    } finally {
      setConcluindoId(null)
    }
  }

  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  const p = pct(performance.rescheduling_done, performance.rescheduling_goal)
  const pendentes = casos.filter((c) => c.status === 'pendente')
  const feitos = casos.filter((c) => c.status === 'feito')

  return (
    <div className="flex flex-col gap-6">
      <HeroCardWhite
        label="Reagendamentos"
        value={`${performance.rescheduling_done} / ${performance.rescheduling_goal}`}
        sub={`${p}% da meta atingida`}
        minWidth={300}
      />

      <div className="card flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <span className="stat-label">Progresso</span>
          <StatusBadge pct={p} />
        </div>
        <ProgressBar pct={p} />
        <span className="text-sm text-muted">{performance.rescheduling_done} de {performance.rescheduling_goal} reagendamentos realizados no período.</span>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading title={`Casos pendentes (${pendentes.length})`} hint="CNPJ e Razão Social — marca como feito quando resolver" />
        {carregandoCasos && <p className="text-sm text-muted">Carregando…</p>}
        {!carregandoCasos && pendentes.length === 0 && <p className="text-sm text-muted">Nenhum caso pendente agora.</p>}
        {pendentes.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="text-sm font-semibold">{c.razao_social}</div>
              <div className="text-xs text-muted">CNPJ: {c.cnpj}</div>
            </div>
            <button type="button" className="btn-primary btn-sm" disabled={concluindoId === c.id} onClick={() => concluir(c.id)}>
              {concluindoId === c.id ? 'Salvando…' : 'Concluir'}
            </button>
          </div>
        ))}
      </div>

      {feitos.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeading title="Concluídos recentemente" />
          {feitos.slice(0, 10).map((c) => (
            <div key={c.id} className="card flex items-center justify-between gap-2 p-3 text-sm text-muted">
              <span>{c.razao_social} · {c.cnpj}</span>
              <span>{c.feito_em ? new Date(c.feito_em).toLocaleDateString('pt-BR') : ''}</span>
            </div>
          ))}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
