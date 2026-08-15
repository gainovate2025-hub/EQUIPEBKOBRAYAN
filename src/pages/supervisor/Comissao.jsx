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
  { key: 'name', label: 'BKO', width: '2fr' },
  { key: 'commission', label: 'Comissão', width: '1fr', align: 'right' },
]

export default function Comissao() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()

  const rows = useMemo(
    () => team
      .map((b) => ({ key: b.id, id: b.id, name: b.name, commission: Number(b.performance?.commission || 0) }))
      .sort((a, b) => b.commission - a.commission),
    [team]
  )
  const total = rows.reduce((s, r) => s + r.commission, 0)

  async function handleCommit(userId, value) {
    try {
      await updatePerformance(userId, { commission: value })
      showToast('Comissão atualizada.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar comissão.', 'error')
    }
  }

  return (
    <>
      <HeroCardWhite label="Comissão total da equipe" value={fmtMoney(total)} sub="Soma da comissão dos 10 BKOs" minWidth={280} />

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Comissão por BKO" hint="Clique no valor para editar" />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            totalRow={{ name: 'Total da equipe', commission: fmtMoney(total) }}
            renderCell={(row, key) => {
              if (key === 'name') return <span className="font-medium">{row.name}</span>
              if (key === 'commission') {
                return <InlineEditableNumber value={row.commission} step="0.01" format={fmtMoney} onCommit={(v) => handleCommit(row.id, v)} />
              }
              return row[key]
            }}
          />
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}
