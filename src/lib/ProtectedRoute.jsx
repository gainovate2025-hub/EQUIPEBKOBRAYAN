import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

// 'supervisor' e 'lider' usam o mesmo painel de gestão (o RLS do banco já
// restringe o que um "lider" enxerga à própria equipe); só 'bko' tem painel à parte.
export function homeFor(role) {
  return role === 'bko' ? '/bko' : '/supervisor'
}

export default function ProtectedRoute({ roles, children }) {
  const { loading, profile } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <span className="text-sm text-muted">Carregando…</span>
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={homeFor(profile.role)} replace />
  }

  return children
}
