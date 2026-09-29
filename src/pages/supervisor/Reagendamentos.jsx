import { useEffect, useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import InlineEditableNumber from '../../components/ui/InlineEditableNumber'
import ProgressBar from '../../components/ui/ProgressBar'
import StatusBadge from '../../components/ui/StatusBadge'
import Field from '../../components/ui/Field'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { updatePerformance, fetchReagendamentoCasos, adicionarReagendamentoCaso, concluirReagendamentoCaso } from '../../lib/api'
import { pct } from '../../lib/helpers'

const COLUMNS = [
  { key: 'name', label: 'BKO', width: '1.6fr' },
  { key: 'done', label: 'Reagendamentos', width: '1fr', align: 'right' },
  { key: 'goal', label: 'Meta', width: '.8fr', align: 'right' },
  { key: 'progress', label: 'Percentual', width: '1.3fr' },
]

export default function Reagendamentos() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [reloadCasos, setReloadCasos] = useState(0)

  const rows = useMemo(
    () => team.map((b) => ({
      key: b.id,
      id: b.id,
      name: b.name,
      goal: b.performance?.rescheduling_goal ?? 0,
      done: b.performance?.rescheduling_done ?? 0,
    })),
    [team]
  )
  const totalGoal = rows.reduce((s, r) => s + r.goal, 0)
  const totalDone = rows.reduce((s, r) => s + r.done, 0)
  const totalPct = pct(totalDone, totalGoal)

  async function commit(userId, field, value) {
    try {
      await updatePerformance(userId, { [field]: value })
      showToast('Reagendamentos atualizados.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar.', 'error')
    }
  }

  return (
    <>
      <HeroCardWhite label="Reagendamentos da equipe" value={`${totalDone} / ${totalGoal}`} sub={`${totalPct}% da meta atingida`} minWidth={300} />

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Reagendamentos por BKO" hint="Clique em Reagendamentos ou Meta para editar" />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            totalRow={{ name: 'Total da equipe', done: totalDone, goal: totalGoal, progress: `${totalPct}%` }}
            renderCell={(row, key) => {
              if (key === 'name') return <span className="font-medium">{row.name}</span>
              if (key === 'done') return <InlineEditableNumber value={row.done} onCommit={(v) => commit(row.id, 'rescheduling_done', v)} />
              if (key === 'goal') return <InlineEditableNumber value={row.goal} onCommit={(v) => commit(row.id, 'rescheduling_goal', v)} />
              if (key === 'progress') {
                const p = pct(row.done, row.goal)
                return (
                  <div className="flex items-center gap-3">
                    <div className="flex-1"><ProgressBar pct={p} /></div>
                    <span className="w-12 text-right text-xs font-semibold text-label">{p}%</span>
                    <StatusBadge pct={p} showLabel={false} />
                  </div>
                )
              }
              return row[key]
            }}
          />
        )}
      </div>

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Casos de reagendamento" hint="Manda um caso novo pro BKO — ele marca como feito quando resolver" />
        <NovoCasoForm team={team} onCriado={() => setReloadCasos((n) => n + 1)} />
        <ListaCasos team={team} reloadKey={reloadCasos} onChanged={() => setReloadCasos((n) => n + 1)} />
      </div>

      <Toast toast={toast} />
    </>
  )
}

function NovoCasoForm({ team, onCriado }) {
  const { toast, showToast } = useToast()
  const [bkoId, setBkoId] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!bkoId || !cnpj.trim() || !razaoSocial.trim()) {
      return showToast('Preenche o BKO, o CNPJ e a Razão Social.', 'error')
    }
    setEnviando(true)
    try {
      await adicionarReagendamentoCaso(bkoId, cnpj.trim(), razaoSocial.trim())
      setCnpj('')
      setRazaoSocial('')
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

  if (carregando) return <p className="text-sm text-muted">Carregando casos…</p>

  return (
    <div className="flex flex-col gap-2">
      {pendentes.length === 0 && <p className="text-sm text-muted">Nenhum caso pendente.</p>}
      {pendentes.map((c) => (
        <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
          <div>
            <div className="text-sm font-semibold">{c.razao_social} <span className="font-normal text-muted">· {c.profiles?.name}</span></div>
            <div className="text-xs text-muted">CNPJ: {c.cnpj}</div>
          </div>
          <button type="button" className="btn-ghost btn-sm" disabled={concluindoId === c.id} onClick={() => concluir(c.id)}>
            {concluindoId === c.id ? 'Salvando…' : 'Marcar feito'}
          </button>
        </div>
      ))}
      <Toast toast={toast} />
    </div>
  )
}
