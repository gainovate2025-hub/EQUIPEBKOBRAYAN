import { useMemo } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import InlineEditableNumber from '../../components/ui/InlineEditableNumber'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { updatePerformance } from '../../lib/api'
import { fmtMoney } from '../../lib/helpers'

const COLUMNS = [
  { key: 'name', label: 'BKO', width: '1.8fr' },
  { key: 'faturas', label: 'Faturas', width: '1fr', align: 'right' },
  { key: 'comissao', label: 'Comissão das faturas', width: '1.2fr', align: 'right' },
]

export default function Faturas() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()

  const rows = useMemo(
    () => team.map((b) => ({
      key: b.id,
      id: b.id,
      name: b.name,
      faturas: b.performance?.faturas_done ?? 0,
    })),
    [team]
  )
  const totalFaturas = rows.reduce((s, r) => s + r.faturas, 0)

  async function commit(userId, valor) {
    try {
      await updatePerformance(userId, { faturas_done: valor })
      showToast('Faturas atualizadas.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar.', 'error')
    }
  }

  return (
    <>
      <HeroCardWhite label="Faturas da equipe" value={totalFaturas} sub={`Comissão total: ${fmtMoney(totalFaturas * 2)}`} minWidth={300} />

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Faturas por BKO" hint="Clique no número pra editar — cada fatura vale R$ 2,00 de comissão" />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            totalRow={{ name: 'Total da equipe', faturas: totalFaturas, comissao: fmtMoney(totalFaturas * 2) }}
            renderCell={(row, key) => {
              if (key === 'name') return <span className="font-medium">{row.name}</span>
              if (key === 'faturas') return <InlineEditableNumber value={row.faturas} onCommit={(v) => commit(row.id, v)} />
              if (key === 'comissao') return fmtMoney(row.faturas * 2)
              return row[key]
            }}
          />
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}
