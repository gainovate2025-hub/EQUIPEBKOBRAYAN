import { useMemo } from 'react'
import { useSupervisorData } from '../../lib/SupervisorDataContext'
import { HeroCardWhite } from '../../components/ui/HeroCard'
import SectionHeading from '../../components/ui/SectionHeading'
import DataTable from '../../components/ui/DataTable'
import InlineEditableNumber from '../../components/ui/InlineEditableNumber'
import ProgressBar from '../../components/ui/ProgressBar'
import StatusBadge from '../../components/ui/StatusBadge'
import Toast from '../../components/ui/Toast'
import { useToast } from '../../lib/useToast'
import { updatePerformance } from '../../lib/api'
import { pct } from '../../lib/helpers'

const COLUMNS = [
  { key: 'name', label: 'BKO', width: '1.6fr' },
  { key: 'done', label: 'Reagendamentos', width: '1fr', align: 'right' },
  { key: 'goal', label: 'Meta', width: '.8fr', align: 'right' },
  { key: 'progress', label: 'Percentual', width: '1.3fr' },
]

export default function Reagendamentos() {
  const { team, loading, reload } = useSupervisorData()
  const { toast, showToast } = useToast()

  const rows = useMemo(
    () => team.map((b) => ({
      key: b.id,
      id: b.id,
      name: b.name,
      goal: b.performance?.rescheduling_goal ?? 0,
      done: b.performance?.rescheduling_done ?? 0,
    })),
    [team]
  )
  const totalGoal = rows.reduce((s, r) => s + r.goal, 0)
  const totalDone = rows.reduce((s, r) => s + r.done, 0)
  const totalPct = pct(totalDone, totalGoal)

  async function commit(userId, field, value) {
    try {
      await updatePerformance(userId, { [field]: value })
      showToast('Reagendamentos atualizados.')
      reload()
    } catch (err) {
      showToast(err.message || 'Falha ao atualizar.', 'error')
    }
  }

  return (
    <>
      <HeroCardWhite label="Reagendamentos da equipe" value={`${totalDone} / ${totalGoal}`} sub={`${totalPct}% da meta atingida`} minWidth={300} />

      <div className="mt-9 flex flex-col gap-4">
        <SectionHeading title="Reagendamentos por BKO" hint="Clique em Reagendamentos ou Meta para editar" />
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            totalRow={{ name: 'Total da equipe', done: totalDone, goal: totalGoal, progress: `${totalPct}%` }}
            renderCell={(row, key) => {
              if (key === 'name') return <span className="font-medium">{row.name}</span>
              if (key === 'done') return <InlineEditableNumber value={row.done} onCommit={(v) => commit(row.id, 'rescheduling_done', v)} />
              if (key === 'goal') return <InlineEditableNumber value={row.goal} onCommit={(v) => commit(row.id, 'rescheduling_goal', v)} />
              if (key === 'progress') {
                const p = pct(row.done, row.goal)
                return (
                  <div className="flex items-center gap-3">
                    <div className="flex-1"><ProgressBar pct={p} /></div>
                    <span className="w-12 text-right text-xs font-semibold text-label">{p}%</span>
                    <StatusBadge pct={p} showLabel={false} />
                  </div>
                )
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
