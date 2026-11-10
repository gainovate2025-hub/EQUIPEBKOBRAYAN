import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, supabaseConfigured, usernameToEmail, encerrarSeSessaoMorta } from './supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, username, role, active, team_id, teams(name, contestacao_label)')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('Falha ao carregar perfil:', error.message)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await loadProfile(newSession?.user?.id)
    })

    // Confere ao abrir o site, a cada 5 min e quando a pessoa volta pra aba.
    encerrarSeSessaoMorta()
    const intervalo = setInterval(encerrarSeSessaoMorta, 5 * 60 * 1000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') encerrarSeSessaoMorta() }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      sub.subscription.unsubscribe()
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [loadProfile])

  async function signIn(username, password) {
    if (!supabaseConfigured) {
      return { error: 'Supabase não configurado. Veja .env.example.' }
    }
    const email = usernameToEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: 'Usuário ou senha inválidos.' }
    }
    await loadProfile(data.user.id)
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    contestacaoLabel: profile?.teams?.contestacao_label || 'Contestações',
    loading,
    signIn,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
