import { useBkoData } from '../../lib/BkoDataContext'
import SectionHeading from '../../components/ui/SectionHeading'
import { fmtDateTime } from '../../lib/helpers'

export default function BkoNotas() {
  const { notes, loading } = useBkoData()

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="Minhas notas" hint="Observações do seu supervisor" />
      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {!loading && notes.length === 0 && <p className="text-sm text-muted">Nenhuma nota registrada ainda.</p>}
      <div className="flex flex-col gap-3">
        {notes.map((n) => (
          <div key={n.id} className="card p-5">
            <span className="text-xs text-muted">{fmtDateTime(n.created_at)}</span>
            <p className="mt-1 text-sm text-label">{n.note}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
