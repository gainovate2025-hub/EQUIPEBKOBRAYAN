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
  { key: 'contest', label: 'Contestações', width: '.8fr', align: 'right' },
  { key: 'resched', label: 'Reagendamentos', width: '.9fr', align: 'right' },
  { key: 'faturas', label: 'Faturas', width: '.7fr', align: 'right' },
  { key: 'commission', label: 'Comissão', width: '1fr', align: 'right' },
]

// Mostra quantos casos de cada tipo cada BKO já fez (contestação/
// reagendamento/fatura — contagem histórica, não depende mais das telas
// removidas em 05/11/2026) junto com a comissão, que continua 100% manual
// (clica no valor pra ajustar).
export default function Comissao() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()

  const rows = useMemo(
    () => team
      .map((b) => ({
        key: b.id,
        id: b.id,
        name: b.name,
        contest: b.performance?.contestations_done ?? 0,
        resched: b.performance?.rescheduling_done ?? 0,
        faturas: b.performance?.faturas_done ?? 0,
        commission: Number(b.performance?.commission || 0),
      }))
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
      <div className="flex flex-wrap gap-4">
        <HeroCardWhite label="Comissão total da equipe" value={fmtMoney(total)} sub="Ajustável manualmente, por pessoa" minWidth={280} />
      </div>

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Comissão por BKO" hint="Contestações/Reagendamentos/Faturas são só contagem — clique no valor da comissão para ajustar" />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            totalRow={{
              name: 'Total da equipe',
              contest: rows.reduce((s, r) => s + r.contest, 0),
              resched: rows.reduce((s, r) => s + r.resched, 0),
              faturas: rows.reduce((s, r) => s + r.faturas, 0),
              commission: fmtMoney(total),
            }}
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
