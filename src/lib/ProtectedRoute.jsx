import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedRoute({ role, children }) {
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

  if (role && profile.role !== role) {
    return <Navigate to={profile.role === 'supervisor' ? '/supervisor' : '/bko'} replace />
  }

  return children
}
