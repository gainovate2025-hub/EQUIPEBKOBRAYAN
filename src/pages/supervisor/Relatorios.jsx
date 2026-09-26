import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import StatCard from '../../components/ui/StatCard'
import DataTable from '../../components/ui/DataTable'
import { fetchTeamRelatorios } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

const COLUMNS = [
  { key: 'date', label: 'Quando', width: '1.4fr' },
  { key: 'name', label: 'BKO', width: '1.4fr' },
  { key: 'reagendamentos', label: 'Reagend.', width: '.8fr', align: 'right' },
  { key: 'contestacoes', label: 'Contest.', width: '.8fr', align: 'right' },
  { key: 'faturas', label: 'Faturas', width: '.8fr', align: 'right' },
]

export default function Relatorios() {
  const { profile } = useAuth()
  const [dados, setDados] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetchTeamRelatorios(profile?.team_id || null)
      .then(setDados)
      .catch((e) => setErro(e.message || 'Falha ao carregar os relatórios.'))
      .finally(() => setLoading(false))
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

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="Relatórios do time" hint="O que cada BKO enviou na aba Relatório (últimos 200)" />
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Reagendamentos" value={soma('reagendamentos')} />
        <StatCard label="Contestações" value={soma('contestacoes')} />
        <StatCard label="Faturas" value={soma('faturas')} />
      </div>
      {erro && <p className="text-sm text-bad-text">{erro}</p>}
      {loading ? <p className="text-sm text-muted">Carregando…</p> : <DataTable columns={COLUMNS} rows={rows} />}
    </div>
  )
}
