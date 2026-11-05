import { useEffect, useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos } from '../../lib/api'

export default function Reagendamentos() {
  const { team } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    fetchReagendamentoCasos()
      .then(setCasos)
      .catch((err) => showToast(err.message || 'Falha ao carregar.', 'error'))
      .finally(() => setCarregando(false))
  }, [])

  const idsDoTime = useMemo(() => new Set(team.map((b) => b.id)), [team])
  const casosDoTime = useMemo(
    () => casos.filter((c) => idsDoTime.has(c.bko_id)).sort((a, b) => new Date(b.feito_em || b.criado_em) - new Date(a.feito_em || a.criado_em)),
    [casos, idsDoTime]
  )

  const porPessoa = useMemo(() => {
    const mapa = new Map()
    for (const c of casosDoTime) {
      const nome = c.profiles?.name || 'Alguém'
      mapa.set(nome, (mapa.get(nome) || 0) + (c.quantidade || 1))
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }, [casosDoTime])

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamentos" hint="Quantos cada BKO já enviou" />

      {!carregando && porPessoa.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {porPessoa.map(([nome, qtd]) => (
            <div key={nome} className="card px-4 py-2 text-sm">
              <span className="font-medium text-ink">{nome}</span>{' '}
              <span className="text-muted">— {qtd} no total</span>
            </div>
          ))}
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : casosDoTime.length === 0 ? (
        <p className="text-sm text-muted">Nenhum reagendamento enviado ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {casosDoTime.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{c.profiles?.name}</span>{' '}
                <span className="text-muted">· {c.quantidade || 1} reagendamento{(c.quantidade || 1) > 1 ? 's' : ''}</span>
              </div>
              <span className="text-xs text-muted">
                {c.feito_em ? new Date(c.feito_em).toLocaleString('pt-BR') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast} />
    </div>
  )
}
