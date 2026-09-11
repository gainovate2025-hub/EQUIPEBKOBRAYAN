import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { HeroCardRed } from '../../components/ui/HeroCard'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import EditBkoModal from '../../components/EditBkoModal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { useAuth } from '../../lib/AuthContext'
import { fmtMoney, pct, statusOf } from '../../lib/helpers'

export default function SupervisorDashboard() {
  const { team, contestacoes, loading, error, reload } = useSupervisorData()
  const { contestacaoLabel, profile } = useAuth()
  const { toast, showToast } = useToast()
  const isLider = profile?.role === 'lider'

  const COLUMNS = [
    { key: 'name', label: 'Funcionário', width: '1.7fr' },
    { key: 'goal', label: 'Meta', width: '.8fr', align: 'right' },
    { key: 'done', label: contestacaoLabel, width: '.9fr', align: 'right' },
    { key: 'pctMeta', label: '% Meta', width: '.8fr', align: 'right' },
    { key: 'resched', label: 'Reagendamentos', width: '1fr', align: 'right' },
    { key: 'commission', label: 'Comissão', width: '.9fr', align: 'right' },
    { key: 'objective', label: 'Objetivo', width: '1.6fr' },
    { key: 'actions', label: '', width: '.7fr', align: 'right' },
  ]

  const SORTS = [
    { key: 'name', label: 'Nome' },
    { key: 'done', label: contestacaoLabel },
    { key: 'resched', label: 'Reagendamentos' },
    { key: 'commission', label: 'Comissão' },
    { key: 'pctMeta', label: '% Meta' },
  ]
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

  const contestStats = useMemo(() => ({
    pendentes: contestacoes.filter((c) => c.status === 'pendente').length,
    recusadas: contestacoes.filter((c) => c.status === 'recusada').length,
  }), [contestacoes])

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
      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(row.bko)}>Editar</button>
    )
    return row[key]
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label={`${contestacaoLabel} autorizadas`} value={totals.done} pct={pctContestacoes} showStatus />
          <StatCard
            label="Pendentes de autorização"
            value={contestStats.pendentes}
            sub={contestStats.pendentes > 0 ? 'Aguardando revisão' : 'Tudo em dia'}
          />
          <StatCard label="Recusadas" value={contestStats.recusadas} />
          <StatCard
            label={isLider ? 'Comissão acumulada da equipe' : 'Comissão acumulada'}
            value={fmtMoney(totals.commission)}
          />
          {isLider && (
            <StatCard
              label="Minha comissão (50% da equipe)"
              value={fmtMoney(totals.commission * 0.5)}
              sub="Calculada automaticamente"
            />
          )}
        </div>
        <HeroCardRed label="Meta da equipe" value={totals.goal} sub={`${totals.done} / ${totals.goal} · ${pctContestacoes}%`} pct={pctContestacoes} />
      </div>

      {contestStats.pendentes > 0 && (
        <Link to="/supervisor/aprovacao" className="card flex items-center justify-between p-4 text-sm hover:border-brand-300">
          <span><strong>{contestStats.pendentes}</strong> {contestacaoLabel.toLowerCase()} aguardando sua autorização.</span>
          <span className="font-medium text-brand-600">Revisar →</span>
        </Link>
      )}

      <StatCard label="Reagendamentos" value={totals.resched} sub={`Meta: ${totals.reschedGoal}`} pct={pctReagendamentos} showStatus />

      <div className="flex flex-col gap-3">
        <SectionHeading title="Resultado da equipe" hint={`Comissão · ${contestacaoLabel} · Reagendamento`} />

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field-input"
            style={{ maxWidth: 220 }}
            placeholder="Buscar BKO…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="field-input" style={{ maxWidth: 190 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos os desempenhos</option>
            <option value="good">Meta atingida</option>
            <option value="warn">Próximo da meta</option>
            <option value="bad">Abaixo da meta</option>
          </select>
          <select className="field-input" style={{ maxWidth: 190 }} value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {SORTS.map((s) => <option key={s.key} value={s.key}>Ordenar por {s.label}</option>)}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? 'Crescente ↑' : 'Decrescente ↓'}
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
