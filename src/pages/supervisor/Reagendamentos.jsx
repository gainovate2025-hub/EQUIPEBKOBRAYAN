import { useEffect, useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fetchReagendamentoCasos, adicionarReagendamentoCaso, concluirReagendamentoCaso } from '../../lib/api'

function diasDesde(iso) {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export default function Reagendamentos() {
  const { team } = useSupervisorData()
  const [reloadCasos, setReloadCasos] = useState(0)

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Reagendamentos a fazer" hint="Manda a lista de CNPJ pra cada BKO fazer — ele marca como feito quando resolver" />
      <NovoCasoForm team={team} onCriado={() => setReloadCasos((n) => n + 1)} />
      <ListaCasos team={team} reloadKey={reloadCasos} onChanged={() => setReloadCasos((n) => n + 1)} />
    </div>
  )
}

function NovoCasoForm({ team, onCriado }) {
  const { toast, showToast } = useToast()
  const [bkoId, setBkoId] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [custcode, setCustcode] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!bkoId || !cnpj.trim() || !razaoSocial.trim()) {
      return showToast('Preenche o BKO, o CNPJ e a Razão Social.', 'error')
    }
    setEnviando(true)
    try {
      await adicionarReagendamentoCaso(bkoId, cnpj.trim(), razaoSocial.trim(), custcode.trim())
      setCnpj('')
      setRazaoSocial('')
      setCustcode('')
      showToast('Caso enviado.')
      onCriado()
    } catch (err) {
      showToast(err.message || 'Falha ao enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-wrap items-end gap-3 p-4">
      <Field label="BKO">
        <select className="field-input" value={bkoId} onChange={(e) => setBkoId(e.target.value)}>
          <option value="">Selecione…</option>
          {team.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="CNPJ">
        <input className="field-input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
      </Field>
      <Field label="Razão Social">
        <input className="field-input" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} placeholder="Nome da empresa" />
      </Field>
      <Field label="CustCode">
        <input className="field-input" value={custcode} onChange={(e) => setCustcode(e.target.value)} placeholder="Ex: CC-10293" />
      </Field>
      <button type="submit" className="btn-primary" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar caso'}
      </button>
      <Toast toast={toast} />
    </form>
  )
}

function ListaCasos({ team, reloadKey, onChanged }) {
  const { toast, showToast } = useToast()
  const [casos, setCasos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [concluindoId, setConcluindoId] = useState(null)

  useEffect(() => {
    setCarregando(true)
    fetchReagendamentoCasos()
      .then(setCasos)
      .catch((err) => showToast(err.message || 'Falha ao carregar casos.', 'error'))
      .finally(() => setCarregando(false))
  }, [reloadKey])

  async function concluir(id) {
    setConcluindoId(id)
    try {
      await concluirReagendamentoCaso(id)
      showToast('Caso concluído.')
      onChanged()
    } catch (err) {
      showToast(err.message || 'Falha ao concluir.', 'error')
    } finally {
      setConcluindoId(null)
    }
  }

  const idsDoTime = useMemo(() => new Set(team.map((b) => b.id)), [team])
  const casosDoTime = casos.filter((c) => idsDoTime.has(c.bko_id))
  const pendentes = casosDoTime.filter((c) => c.status === 'pendente')
  const vencidos = pendentes.filter((c) => diasDesde(c.criado_em) >= 9)
  const noPrazo = pendentes.filter((c) => diasDesde(c.criado_em) < 9)

  if (carregando) return <p className="text-sm text-muted">Carregando casos…</p>

  return (
    <div className="flex flex-col gap-2">
      {vencidos.length === 0 && noPrazo.length === 0 && <p className="text-sm text-muted">Nenhum caso pendente.</p>}

      {vencidos.length > 0 && (
        <div className="rounded-lg border border-bad-text/40 bg-bad-text/10 p-3 text-sm text-bad-text">
          ⚠️ {vencidos.length} caso{vencidos.length === 1 ? '' : 's'} passou{vencidos.length === 1 ? '' : 'ram'} de 9 dias sem conclusão — cobra o BKO.
        </div>
      )}

      {[...vencidos, ...noPrazo].map((c) => {
        const vencido = diasDesde(c.criado_em) >= 9
        return (
          <div key={c.id} className={`card flex flex-wrap items-center justify-between gap-2 p-3 ${vencido ? 'border-bad-text/40' : ''}`}>
            <div>
              <div className="text-sm font-semibold">{c.razao_social} <span className="font-normal text-muted">· {c.profiles?.name}</span></div>
              <div className="text-xs text-muted">
                CNPJ: {c.cnpj}{c.custcode && <> · CustCode: {c.custcode}</>} · há {diasDesde(c.criado_em)} dia{diasDesde(c.criado_em) === 1 ? '' : 's'}
              </div>
            </div>
            <button type="button" className="btn-ghost btn-sm" disabled={concluindoId === c.id} onClick={() => concluir(c.id)}>
              {concluindoId === c.id ? 'Salvando…' : 'Marcar feito'}
            </button>
          </div>
        )
      })}
      <Toast toast={toast} />
    </div>
  )
}
