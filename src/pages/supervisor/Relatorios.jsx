import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import StatCard from '../../components/ui/StatCard'
import DataTable from '../../components/ui/DataTable'
import {
  fetchTeamRelatorios,
  fetchPlanilhaLinhas,
  fetchReagendamentoCasos,
  fetchContestacaoSheetRelatorioMes,
} from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

const COLUMNS = [
  { key: 'date', label: 'Quando', width: '1.4fr' },
  { key: 'name', label: 'BKO', width: '1.4fr' },
  { key: 'reagendamentos', label: 'Reagend.', width: '.8fr', align: 'right' },
  { key: 'contestacoes', label: 'Contest.', width: '.8fr', align: 'right' },
  { key: 'faturas', label: 'Faturas', width: '.8fr', align: 'right' },
]

const COLUNAS_GERAL = [
  { key: 'name', label: 'BKO', width: '1.6fr' },
  { key: 'faturasPagas', label: 'Faturas pagas', width: '1fr', align: 'right' },
  { key: 'reagendFeitos', label: 'Reagend. feitos', width: '1.1fr', align: 'right' },
  { key: 'reagendPendentes', label: 'Reagend. pendentes', width: '1.2fr', align: 'right' },
  { key: 'contestEnviadas', label: 'Contest. enviadas (mês)', width: '1.3fr', align: 'right' },
  { key: 'contestSairam', label: 'Contest. saíram (mês)', width: '1.2fr', align: 'right' },
]

function linhaVazia(nome) {
  return {
    key: nome,
    name: nome,
    faturasPagas: 0,
    reagendFeitos: 0,
    reagendPendentes: 0,
    contestEnviadas: 0,
    contestSairam: 0,
  }
}

export default function Relatorios() {
  const { profile } = useAuth()
  const [dados, setDados] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [faturas, setFaturas] = useState([])
  const [reagendamentos, setReagendamentos] = useState([])
  const [contestacoesMes, setContestacoesMes] = useState([])
  const [loadingGeral, setLoadingGeral] = useState(true)
  const [erroGeral, setErroGeral] = useState('')

  useEffect(() => {
    fetchTeamRelatorios(profile?.team_id || null)
      .then(setDados)
      .catch((e) => setErro(e.message || 'Falha ao carregar os relatórios.'))
      .finally(() => setLoading(false))
  }, [profile?.team_id])

  useEffect(() => {
    const teamId = profile?.team_id || null
    Promise.all([
      fetchPlanilhaLinhas('fatura').catch(() => ({ linhas: [] })),
      fetchReagendamentoCasos({ teamId }).catch(() => []),
      fetchContestacaoSheetRelatorioMes(teamId).catch(() => []),
    ])
      .then(([fat, reag, cont]) => {
        setFaturas(fat.linhas || [])
        setReagendamentos(reag)
        setContestacoesMes(cont)
      })
      .catch((e) => setErroGeral(e.message || 'Falha ao carregar a visão geral.'))
      .finally(() => setLoadingGeral(false))
  }, [profile?.team_id])

  const soma = (k) => dados.reduce((t, r) => t + (r[k] || 0), 0)
  const rows = dados.map((r) => ({
    key: r.id,
    date: fmtDateTime(r.created_at),
    name: r.profiles?.name || '—',
    reagendamentos: r.reagendamentos || '—',
    contestacoes: r.contestacoes || '—',
    faturas: r.faturas || '—',
  }))

  const totalFaturasPagas = useMemo(
    () => faturas.filter((l) => (l.status || '').trim().toUpperCase() === 'FATURA PAGA').length,
    [faturas]
  )
  const totalReagendFeitos = useMemo(() => reagendamentos.filter((r) => r.status === 'feito').length, [reagendamentos])
  const totalReagendPendentes = useMemo(
    () => reagendamentos.filter((r) => r.status === 'pendente').length,
    [reagendamentos]
  )
  const totalContestEnviadas = contestacoesMes.length
  const totalContestSairam = useMemo(() => contestacoesMes.filter((c) => c.saiu_em).length, [contestacoesMes])

  const linhasGeral = useMemo(() => {
    const mapa = new Map()
    const pega = (nome) => {
      const chave = nome || 'Sem nome'
      if (!mapa.has(chave)) mapa.set(chave, linhaVazia(chave))
      return mapa.get(chave)
    }
    faturas
      .filter((l) => (l.status || '').trim().toUpperCase() === 'FATURA PAGA')
      .forEach((l) => { pega(l.vendedor).faturasPagas += 1 })
    reagendamentos.forEach((r) => {
      const linha = pega(r.profiles?.name)
      if (r.status === 'feito') linha.reagendFeitos += 1
      else if (r.status === 'pendente') linha.reagendPendentes += 1
    })
    contestacoesMes.forEach((c) => {
      const linha = pega(c.profiles?.name)
      linha.contestEnviadas += 1
      if (c.saiu_em) linha.contestSairam += 1
    })
    return [...mapa.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [faturas, reagendamentos, contestacoesMes])

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <SectionHeading
          title="Visão geral"
          hint="Números reais — faturas pagas e contestações vêm da planilha/histórico, reagendamentos da fila de casos (não é autodeclarado)"
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Faturas pagas" value={totalFaturasPagas} />
          <StatCard label="Reagend. feitos" value={totalReagendFeitos} />
          <StatCard label="Reagend. pendentes" value={totalReagendPendentes} />
          <StatCard label="Contest. enviadas (mês)" value={totalContestEnviadas} />
          <StatCard label="Contest. saíram (mês)" value={totalContestSairam} />
        </div>
        {erroGeral && <p className="text-sm text-bad-text">{erroGeral}</p>}
        {loadingGeral ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable columns={COLUNAS_GERAL} rows={linhasGeral} />
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeading title="Relatórios do time" hint="O que cada BKO enviou na aba Relatório (últimos 200, autodeclarado)" />
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Reagendamentos" value={soma('reagendamentos')} />
          <StatCard label="Contestações" value={soma('contestacoes')} />
          <StatCard label="Faturas" value={soma('faturas')} />
        </div>
        {erro && <p className="text-sm text-bad-text">{erro}</p>}
        {loading ? <p className="text-sm text-muted">Carregando…</p> : <DataTable columns={COLUMNS} rows={rows} />}
      </div>
    </div>
  )
}
