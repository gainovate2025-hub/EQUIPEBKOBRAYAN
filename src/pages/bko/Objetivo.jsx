import { useBkoData } from '../../lib/BkoDataContext'

export default function BkoObjetivo() {
  const { performance, loading } = useBkoData()
  if (loading || !performance) return <p className="text-sm text-muted">Carregando…</p>

  return (
    <div className="card max-w-2xl p-7">
      <span className="stat-label">Meu objetivo</span>
      <p className="mt-3 text-lg leading-relaxed">
        {performance.objective || 'Seu supervisor ainda não definiu um objetivo.'}
      </p>
    </div>
  )
}
