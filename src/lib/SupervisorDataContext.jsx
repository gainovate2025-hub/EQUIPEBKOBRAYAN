import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchAllNotes, fetchTeam } from './api'

const Ctx = createContext(null)

export function SupervisorDataProvider({ children }) {
  const [team, setTeam] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [teamData, notesData] = await Promise.all([fetchTeam(), fetchAllNotes()])
      setTeam(teamData)
      setNotes(notesData)
    } catch (err) {
      setError(err.message || 'Falha ao carregar dados da equipe.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return <Ctx.Provider value={{ team, notes, loading, error, reload }}>{children}</Ctx.Provider>
}

export function useSupervisorData() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSupervisorData deve ser usado dentro de <SupervisorDataProvider>')
  return ctx
}
