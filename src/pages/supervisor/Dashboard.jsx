import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import StatCard from '../../components/ui/StatCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import EditBkoModal from '../../components/EditBkoModal'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { useAuth } from '../../lib/AuthContext'
import { fmtMoney, pct } from '../../lib/helpers'
import EnviosPortabilidade from '../../components/portabilidade/EnviosPortabilidade'

// Dashboard do supervisor, simplificado em 05/11/2026 (Brayan pediu pra
// tirar aprovação/contestação/meta de contestação do site). O que ainda
// existe de contestação é só a CONTAGEM histórica (contestations_done),
// mostrada ao lado de reagendamentos e comissão, sem fila de aprovação,
// sem meta, sem pendente/recusada (isso dependia da tabela `contestacoes`,
// removida).
export default function SupervisorDashboard() {
  const { team, loading, error, reload } = useSupervisorData()
  const { profile, user, contestacaoLabel, portabilidade } = useAuth()
  const eu = useMeuMes(user?.id)
  const { toast, showToast } = useToast()
  const isLider = profile?.role === 'lider'

  // Equipe de portabilidade: sem reagendamento/fatura (migration_075).
  const COLUMNS = [
    { key: 'name', label: 'Funcionário', width: '1.7fr' },
    portabilidade && { key: 'casos', label: 'CNPJs trabalhados', width: '1fr', align: 'right' },
    { key: 'contest', label: contestacaoLabel, width: '.9fr', align: 'right' },
    !portabilidade && { key: 'resched', label: 'Reagendamentos', width: '1fr', align: 'right' },
    !portabilidade && { key: 'faturas', label: 'Faturas', width: '.8fr', align: 'right' },
    { key: 'commission', label: 'Comissão', width: '.9fr', align: 'right' },
    { key: 'actions', label: '', width: '.7fr', align: 'right' },
  ].filter(Boolean)

  const SORTS = [
    { key: 'name', label: 'Nome' },
    { key: 'contest', label: contestacaoLabel },
    portabilidade && { key: 'casos', label: 'CNPJs trabalhados' },
    !portabilidade && { key: 'resched', label: 'Reagendamentos' },
    { key: 'commission', label: 'Comissão' },
  ].filter(Boolean)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // Só os BKOs (base da "Minha comissão": metade disso).
  const totaisBkos = useMemo(() => {
    return team.reduce(
      (acc, b) => {
        const p = b.performance || {}
        acc.contest += p.contestations_done || 0
        acc.reschedGoal += p.rescheduling_goal || 0
        acc.resched += p.rescheduling_done || 0
        acc.faturas += p.faturas_done || 0
        acc.casos += p.casos_portabilidade || 0
        acc.commission += Number(p.commission || 0)
        return acc
      },
      { contest: 0, reschedGoal: 0, resched: 0, faturas: 0, casos: 0, commission: 0 }
    )
  }, [team])

  // 26/11/2026 (Brayan): o que ele mesmo faz (lançado no "Meu relatório"
  // deste mês) conta no total da equipe. Vale igual BKO: contestação R$2,
  // fatura R$2, reagendamento R$1.
  const totals = useMemo(() => ({
    ...totaisBkos,
    contest: totaisBkos.contest + eu.contest,
    resched: totaisBkos.resched + eu.resched,
    faturas: totaisBkos.faturas + eu.faturas,
    commission: totaisBkos.commission + eu.commission,
  }), [totaisBkos, eu])
  const minhaComissao = totaisBkos.commission / 2 + eu.commission

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
        casos: p.casos_portabilidade ?? 0,
        commission: Number(p.commission || 0),
      }
    })
    if (eu.temAlgo) {
      list.push({ key: 'eu', eu: true, name: `${profile?.name || 'Você'} (você)`, contest: eu.contest, resched: eu.resched, faturas: eu.faturas, casos: 0, commission: eu.commission })
    }

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
  }, [team, search, sortKey, sortDir, eu, profile])

  const totalRow = {
    name: 'Total da equipe',
    contest: totals.contest,
    resched: totals.resched,
    faturas: totals.faturas,
    casos: totals.casos,
    commission: fmtMoney(totals.commission),
    actions: '',
  }

  function renderCell(row, key) {
    if (row.key === undefined) return row[key]
    if (key === 'name') return <span className="font-medium">{row.name}</span>
    if (key === 'commission') return fmtMoney(row.commission)
    if (key === 'actions' && row.eu) return <span className="text-xs text-muted">Meu relatório</span>
    if (key === 'actions') return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(row.bko)}>Editar</button>
    )
    return row[key]
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Reagendamentos aparece uma vez só (10/11/2026): antes tinha um
          cartão de meta e outro de realizados mostrando a mesma coisa. */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${eu.ativo ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {!portabilidade && (
          <StatCard
            label="Reagendamentos"
            value={`${totals.resched} / ${totals.reschedGoal}`}
            sub={`${pctReagendamentos}% da meta`}
            pct={pctReagendamentos}
            showStatus
          />
        )}
        <StatCard label={`${contestacaoLabel} (total)`} value={totals.contest} />
        {!portabilidade && <StatCard label="Faturas (total)" value={totals.faturas} />}
        {portabilidade && <StatCard label="CNPJs trabalhados (total)" value={totals.casos} />}
        <StatCard
          label={isLider ? 'Comissão acumulada da equipe' : 'Comissão acumulada'}
          value={fmtMoney(totals.commission)}
          sub={eu.temAlgo ? `inclui ${fmtMoney(eu.commission)} seus` : undefined}
        />
        {eu.ativo && (
          <StatCard
            label="Minha comissão"
            value={fmtMoney(minhaComissao)}
            sub={`metade dos BKOs ${fmtMoney(totaisBkos.commission / 2)} + seu ${fmtMoney(eu.commission)}`}
          />
        )}
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

      {portabilidade && <EnviosPortabilidade modo="lider" onMudou={reload} />}

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

// Soma do "Meu relatório" do mês atual (migration_078). O painel é zerado
// todo mês, então só o mês atual conta. Sem a tabela: tudo zero (ativo=false).
function useMeuMes(userId) {
  const [eu, setEu] = useState({ contest: 0, faturas: 0, resched: 0, commission: 0, temAlgo: false, ativo: false })
  useEffect(() => {
    if (!userId) return
    const d = new Date()
    const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    supabase
      .from('relatorios_pessoais')
      .select('contestacoes, faturas, reagendamentos')
      .eq('user_id', userId)
      .gte('data', ini)
      .then(({ data, error }) => {
        if (error) return
        const s = (data || []).reduce((t, l) => ({
          contest: t.contest + (l.contestacoes || 0),
          faturas: t.faturas + (l.faturas || 0),
          resched: t.resched + (l.reagendamentos || 0),
        }), { contest: 0, faturas: 0, resched: 0 })
        const commission = s.contest * 2 + s.faturas * 2 + s.resched * 1
        setEu({ ...s, commission, temAlgo: (data || []).length > 0, ativo: true })
      })
  }, [userId])
  return eu
}
