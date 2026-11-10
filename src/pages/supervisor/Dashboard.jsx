import { useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import EditBkoModal from '../../components/EditBkoModal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { useAuth } from '../../lib/AuthContext'
import { fmtMoney, pct } from '../../lib/helpers'

// Dashboard do supervisor, simplificado em 05/11/2026 (Brayan pediu pra
// tirar aprovação/contestação/meta de contestação do site). O que ainda
// existe de contestação é só a CONTAGEM histórica (contestations_done),
// mostrada ao lado de reagendamentos e comissão, sem fila de aprovação,
// sem meta, sem pendente/recusada (isso dependia da tabela `contestacoes`,
// removida).
export default function SupervisorDashboard() {
  const { team, loading, error, reload } = useSupervisorData()
  const { profile } = useAuth()
  const { toast, showToast } = useToast()
  const isLider = profile?.role === 'lider'

  const COLUMNS = [
    { key: 'name', label: 'Funcionário', width: '1.7fr' },
    { key: 'contest', label: 'Contestações', width: '.9fr', align: 'right' },
    { key: 'resched', label: 'Reagendamentos', width: '1fr', align: 'right' },
    { key: 'faturas', label: 'Faturas', width: '.8fr', align: 'right' },
    { key: 'commission', label: 'Comissão', width: '.9fr', align: 'right' },
    { key: 'actions', label: '', width: '.7fr', align: 'right' },
  ]

  const SORTS = [
    { key: 'name', label: 'Nome' },
    { key: 'contest', label: 'Contestações' },
    { key: 'resched', label: 'Reagendamentos' },
    { key: 'commission', label: 'Comissão' },
  ]
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const totals = useMemo(() => {
    return team.reduce(
      (acc, b) => {
        const p = b.performance || {}
        acc.contest += p.contestations_done || 0
        acc.reschedGoal += p.rescheduling_goal || 0
        acc.resched += p.rescheduling_done || 0
        acc.faturas += p.faturas_done || 0
        acc.commission += Number(p.commission || 0)
        return acc
      },
      { contest: 0, reschedGoal: 0, resched: 0, faturas: 0, commission: 0 }
    )
  }, [team])

  const pctReagendamentos = pct(totals.resched, totals.reschedGoal)

  const rows = useMemo(() => {
    let list = team.map((b) => {
      const p = b.performance || {}
      return {
        key: b.id,
        bko: b,
        name: b.name,
        contest: p.contestations_done ?? 0,
        resched: p.rescheduling_done ?? 0,
        faturas: p.faturas_done ?? 0,
        commission: Number(p.commission || 0),
      }
    })

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((r) => r.name.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (typeof a[sortKey] === 'string') return a[sortKey].localeCompare(b[sortKey]) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
    return list
  }, [team, search, sortKey, sortDir])

  const totalRow = {
    name: 'Total da equipe',
    contest: totals.contest,
    resched: totals.resched,
    faturas: totals.faturas,
    commission: fmtMoney(totals.commission),
    actions: '',
  }

  function renderCell(row, key) {
    if (row.key === undefined) return row[key]
    if (key === 'name') return <span className="font-medium">{row.name}</span>
    if (key === 'commission') return fmtMoney(row.commission)
    if (key === 'actions') return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(row.bko)}>Editar</button>
    )
    return row[key]
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Reagendamentos aparece uma vez só (10/11/2026): antes tinha um
          cartão de meta e outro de realizados mostrando a mesma coisa. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Reagendamentos"
          value={`${totals.resched} / ${totals.reschedGoal}`}
          sub={`${pctReagendamentos}% da meta`}
          pct={pctReagendamentos}
          showStatus
        />
        <StatCard label="Contestações (total)" value={totals.contest} />
        <StatCard label="Faturas (total)" value={totals.faturas} />
        <StatCard
          label={isLider ? 'Comissão acumulada da equipe' : 'Comissão acumulada'}
          value={fmtMoney(totals.commission)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading title="Resultado da equipe" />

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field-input max-w-[220px]"
            aria-label="Buscar BKO"
            placeholder="Buscar BKO…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="field-input max-w-[190px]" aria-label="Ordenar por" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>Ordenar por {s.label}</option>)}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
          </button>
        </div>

        {loading && <p className="text-sm text-muted">Carregando equipe…</p>}
        {error && <p className="text-sm font-medium text-bad-text">{error}</p>}
        {!loading && !error && (
          <DataTable columns={COLUMNS} rows={rows} totalRow={totalRow} renderCell={renderCell} />
        )}
      </div>

      {editing && (
        <EditBkoModal
          bko={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
          showToast={showToast}
        />
      )}
      <Toast toast={toast} />
    </div>
  )
}
