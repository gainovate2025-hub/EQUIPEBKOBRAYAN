import { useMemo, useState } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { HeroCardRed } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import EditBkoModal from '../../components/EditBkoModal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { fmtMoney, pct, statusOf } from '../../lib/helpers'

const COLUMNS = [
  { key: 'name', label: 'Funcionário', width: '1.7fr' },
  { key: 'goal', label: 'Meta', width: '.8fr', align: 'right' },
  { key: 'done', label: 'Contestações', width: '.9fr', align: 'right' },
  { key: 'pctMeta', label: '% Meta', width: '.8fr', align: 'right' },
  { key: 'resched', label: 'Reagendamentos', width: '1fr', align: 'right' },
  { key: 'commission', label: 'Comissão', width: '.9fr', align: 'right' },
  { key: 'objective', label: 'Objetivo', width: '1.6fr' },
  { key: 'actions', label: '', width: '.7fr', align: 'right' },
]

const SORTS = [
  { key: 'name', label: 'Nome' },
  { key: 'done', label: 'Contestações' },
  { key: 'resched', label: 'Reagendamentos' },
  { key: 'commission', label: 'Comissão' },
  { key: 'pctMeta', label: '% Meta' },
]

export default function SupervisorDashboard() {
  const { team, loading, error, reload } = useSupervisorData()
  const { toast, showToast } = useToast()
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [statusFilter, setStatusFilter] = useState('all')

  const totals = useMemo(() => {
    return team.reduce(
      (acc, b) => {
        const p = b.performance || {}
        acc.goal += p.contestation_goal || 0
        acc.done += p.contestations_done || 0
        acc.reschedGoal += p.rescheduling_goal || 0
        acc.resched += p.rescheduling_done || 0
        acc.commission += Number(p.commission || 0)
        return acc
      },
      { goal: 0, done: 0, reschedGoal: 0, resched: 0, commission: 0 }
    )
  }, [team])

  const pctContestacoes = pct(totals.done, totals.goal)
  const pctReagendamentos = pct(totals.resched, totals.reschedGoal)

  const rows = useMemo(() => {
    let list = team.map((b) => {
      const p = b.performance || {}
      const pctMeta = pct(p.contestations_done, p.contestation_goal)
      return {
        key: b.id,
        bko: b,
        name: b.name,
        goal: p.contestation_goal ?? 0,
        done: p.contestations_done ?? 0,
        pctMeta,
        resched: p.rescheduling_done ?? 0,
        commission: Number(p.commission || 0),
        objective: p.objective || '—',
      }
    })

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((r) => r.name.toLowerCase().includes(q))
    }
    if (statusFilter !== 'all') {
      list = list.filter((r) => statusOf(r.pctMeta).tone === statusFilter)
    }
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (typeof a[sortKey] === 'string') return a[sortKey].localeCompare(b[sortKey]) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
    return list
  }, [team, search, statusFilter, sortKey, sortDir])

  const totalRow = {
    name: 'Total da equipe',
    goal: totals.goal,
    done: totals.done,
    pctMeta: `${pctContestacoes}%`,
    resched: totals.resched,
    commission: fmtMoney(totals.commission),
    objective: '',
    actions: '',
  }

  function renderCell(row, key) {
    if (row.key === undefined) return row[key]
    if (key === 'name') return <span className="font-medium">{row.name}</span>
    if (key === 'pctMeta') return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        {row.pctMeta}% <StatusBadge pct={row.pctMeta} showLabel={false} />
      </span>
    )
    if (key === 'commission') return fmtMoney(row.commission)
    if (key === 'objective') return <span className="text-muted">{row.objective}</span>
    if (key === 'actions') return (
      <button type="button" className="btn-ghost" style={{ padding: '6px 14px', fontSize: 12.5 }} onClick={() => setEditing(row.bko)}>Editar</button>
    )
    return row[key]
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div />
        <HeroCardRed label="Meta" value={totals.goal} sub={`${totals.done} / ${totals.goal} · ${pctContestacoes}%`} pct={pctContestacoes} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard label="Contestações" value={totals.done} sub={`Meta: ${totals.goal}`} pct={pctContestacoes} delay={0.14} showStatus />
        <StatCard label="Reagendamentos" value={totals.resched} sub={`Meta: ${totals.reschedGoal}`} pct={pctReagendamentos} delay={0.22} showStatus />
        <StatCard label="Comissão" value={fmtMoney(totals.commission)} sub="Total da equipe no período" delay={0.3} />
      </div>

      <div className="mt-11 flex flex-col gap-4" style={{ animation: 'bkoRise .55s .36s ease both' }}>
        <SectionHeading title="Resultado da equipe" hint="Comissão · Contestação · Reagendamento" />

        <div className="flex flex-wrap items-center gap-3">
          <input
            className="field-input"
            style={{ maxWidth: 240 }}
            placeholder="Buscar BKO…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="field-input" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos os desempenhos</option>
            <option value="good">🟢 Meta atingida</option>
            <option value="warn">🟡 Próximo da meta</option>
            <option value="bad">🔴 Abaixo da meta</option>
          </select>
          <select className="field-input" style={{ maxWidth: 200 }} value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>Ordenar por {s.label}</option>)}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'}
          </button>
        </div>

        {loading && <p className="text-sm text-muted">Carregando equipe…</p>}
        {error && <p className="text-sm font-medium text-brand-700">{error}</p>}
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
    </>
  )
}
