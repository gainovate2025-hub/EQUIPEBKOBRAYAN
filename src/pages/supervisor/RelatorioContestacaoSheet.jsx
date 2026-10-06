import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import SectionHeading from '../../components/ui/SectionHeading'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import DataTable from '../../components/ui/DataTable'
import { fetchContestacaoSheetRelatorioMes, fetchContestacaoSheetPendentesRecentes } from '../../lib/api'
import { fmtDateTime } from '../../lib/helpers'

const COLUNAS_POR_BKO = [
  { key: 'name', label: 'BKO', width: '1.6fr' },
  { key: 'enviadas', label: 'Enviadas', width: '.9fr', align: 'right' },
  { key: 'saidas', label: 'Saíram do sistema', width: '1.1fr', align: 'right' },
  { key: 'pendentes', label: 'Ainda em trâmite', width: '1.1fr', align: 'right' },
]

const COLUNAS_PENDENTES = [
  { key: 'custcode', label: 'Cust Code', width: '1fr' },
  { key: 'nome', label: 'Cliente', width: '1.4fr' },
  { key: 'bko', label: 'BKO', width: '1.2fr' },
  { key: 'enviado', label: 'Enviado em', width: '1.1fr' },
]

export default function RelatorioContestacaoSheet() {
  const { profile } = useAuth()
  const [doMes, setDoMes] = useState([])
  const [pendentesRecentes, setPendentesRecentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const teamId = profile?.team_id || null
    Promise.all([
      fetchContestacaoSheetRelatorioMes(teamId),
      fetchContestacaoSheetPendentesRecentes(teamId),
    ])
      .then(([mes, pendentes]) => {
        setDoMes(mes)
        setPendentesRecentes(pendentes)
      })
      .catch((e) => setErro(e.message || 'Falha ao carregar o relatório.'))
      .finally(() => setLoading(false))
  }, [profile?.team_id])

  const porBko = useMemo(() => {
    const mapa = new Map()
    doMes.forEach((r) => {
      const nome = r.profiles?.name || 'Sem nome'
      const atual = mapa.get(nome) || { key: nome, name: nome, enviadas: 0, saidas: 0 }
      atual.enviadas += 1
      if (r.saiu_em) atual.saidas += 1
      mapa.set(nome, atual)
    })
    return [...mapa.values()]
      .map((r) => ({ ...r, pendentes: r.enviadas - r.saidas }))
      .sort((a, b) => b.enviadas - a.enviadas)
  }, [doMes])

  const totalEnviadas = doMes.length
  const totalSaidas = doMes.filter((r) => r.saiu_em).length

  const linhasPendentes = pendentesRecentes.map((r) => ({
    key: r.id,
    custcode: r.cust_code,
    nome: r.nome_cliente || '—',
    bko: r.profiles?.name || '—',
    enviado: fmtDateTime(r.enviado_em),
  }))

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <HeroCardWhite label="Enviadas este mês" value={totalEnviadas} minWidth={220} />
        <HeroCardWhite label="Saíram do sistema" value={totalSaidas} minWidth={220} />
        <HeroCardWhite label="Ainda em trâmite" value={totalEnviadas - totalSaidas} minWidth={220} />
      </div>

      {erro && <p className="mt-4 text-sm font-medium text-bad-text">{erro}</p>}

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading
          title="Contestações por BKO"
          hint="Contagem do mês atual — zera sozinho todo mês, sem perder o histórico de quem ainda está em trâmite"
        />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable columns={COLUNAS_POR_BKO} rows={porBko} />
        )}
      </div>

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading
          title="Ainda não saíram do sistema (últimos 14 dias)"
          hint="O TIM pode levar até 10 dias pra tirar um Cust Code da fila — por isso esses continuam aqui mesmo que o mês vire"
        />
        {!loading && linhasPendentes.length === 0 && (
          <p className="text-sm text-muted">Nenhum Cust Code pendente nos últimos 14 dias.</p>
        )}
        {linhasPendentes.length > 0 && <DataTable columns={COLUNAS_PENDENTES} rows={linhasPendentes} />}
      </div>
    </>
  )
}
