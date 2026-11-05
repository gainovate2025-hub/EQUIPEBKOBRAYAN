import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos, concluirReagendamentoCaso } from '../../lib/api'

function diasDesde(iso) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export default function BkoReagendamentos() {
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [concluindoId, setConcluindoId] = useState(null)

  async function carregarCasos() {
    if (!profile?.id) return
    setCarregando(true)
    try {
      const dados = await fetchReagendamentoCasos({ bkoId: profile.id })
      setCasos(dados)
    } catch (err) {
      showToast(err.message || 'Falha ao carregar casos.', 'error')
    } finally {
      setCarregando(false)
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

  if (carregando) return <p className="text-sm text-muted">Carregando…</p>

  const pendentes = casos.filter((c) => c.status === 'pendente')
  const vencidos = pendentes.filter((c) => diasDesde(c.criado_em) >= 9)
  const noPrazo = pendentes.filter((c) => diasDesde(c.criado_em) < 9)
  const feitos = casos.filter((c) => c.status === 'feito')

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamentos a fazer" hint="CNPJ e CustCode dos casos que você precisa reagendar" />

      {vencidos.length > 0 && (
        <div className="rounded-lg border border-bad-text/40 bg-bad-text/10 p-4">
          <p className="text-sm font-semibold text-bad-text">
            ⚠️ {vencidos.length} caso{vencidos.length === 1 ? '' : 's'} passou{vencidos.length === 1 ? '' : 'ram'} do prazo (9 dias) — refaça:
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {vencidos.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-paper p-3">
                <div>
                  <div className="text-sm font-semibold">{c.razao_social}</div>
                  <div className="text-xs text-muted">CNPJ: {c.cnpj}{c.custcode && <> · CustCode: <strong>{c.custcode}</strong></>}</div>
                </div>
                <button type="button" className="btn-primary btn-sm" disabled={concluindoId === c.id} onClick={() => concluir(c.id)}>
                  {concluindoId === c.id ? 'Salvando…' : 'Concluir'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeading title={`Casos pendentes (${noPrazo.length})`} hint="CNPJ e Razão Social — marca como feito quando resolver" />
        {noPrazo.length === 0 && <p className="text-sm text-muted">Nenhum caso pendente agora.</p>}
        {noPrazo.map((c) => (
          <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="text-sm font-semibold">{c.razao_social}</div>
              <div className="text-xs text-muted">CNPJ: {c.cnpj}{c.custcode && <> · CustCode: {c.custcode}</>}</div>
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
