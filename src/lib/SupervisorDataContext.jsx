import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchTeam } from './api'
import { useAuth } from './AuthContext'

const Ctx = createContext(null)

export function SupervisorDataProvider({ children }) {
  const { profile } = useAuth()
  const teamId = profile?.team_id || null
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTeam(await fetchTeam(teamId))
    } catch (err) {
      setError(err.message || 'Falha ao carregar dados da equipe.')
    } finally {
      setLoading(false)
    }
  }, [teamId])

  useEffect(() => {
    reload()
  }, [reload])

  return <Ctx.Provider value={{ team, loading, error, reload }}>{children}</Ctx.Provider>
}

export function useSupervisorData() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSupervisorData deve ser usado dentro de <SupervisorDataProvider>')
  return ctx
}
