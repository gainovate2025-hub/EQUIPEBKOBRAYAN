import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchOwnDailyReports, fetchOwnPerformance } from './api'

const Ctx = createContext(null)

export function BkoDataProvider({ children }) {
  const { user } = useAuth()
  const [performance, setPerformance] = useState(null)
  const [dailyReports, setDailyReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const [perf, reportsData] = await Promise.all([fetchOwnPerformance(user.id), fetchOwnDailyReports(user.id)])
      setPerformance(perf)
      setDailyReports(reportsData)
    } catch (err) {
      setError(err.message || 'Falha ao carregar seu desempenho.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  return <Ctx.Provider value={{ performance, dailyReports, loading, error, reload }}>{children}</Ctx.Provider>
}

export function useBkoData() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBkoData deve ser usado dentro de <BkoDataProvider>')
  return ctx
}
