import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, supabaseConfigured, usernameToEmail, encerrarSeSessaoMorta } from './supabaseClient'

const AuthContext = createContext(null)

// Trava do login num computador só (migration_078, Brayan 26/11/2026).
// Cada navegador ganha um código próprio guardado nele mesmo.
const CHAVE_DISPOSITIVO = 'bko_dispositivo'
export function idDoDispositivo() {
  try {
    let id = localStorage.getItem(CHAVE_DISPOSITIVO)
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
      localStorage.setItem(CHAVE_DISPOSITIVO, id)
    }
    return id
  } catch {
    return 'sem-armazenamento'
  }
}

const AVISO_TRAVADO = 'Este login só pode ser usado no computador do dono.'

// true = este computador NÃO pode usar esse login (trava ligada em outro).
// Antes da migration_078 a função não existe: aí não trava nada.
async function bloqueadoNesteComputador() {
  const { data, error } = await supabase.rpc('meu_dispositivo_travado')
  if (error || !data) return false
  return data !== idDoDispositivo()
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [avisoLogin, setAvisoLogin] = useState('')

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const campos = 'id, name, username, role, active, team_id'
    let { data, error } = await supabase
      .from('profiles')
      .select(`${campos}, teams(name, contestacao_label, tipo)`)
      .eq('id', userId)
      .single()
    // Antes da migration_075 a coluna teams.tipo não existe: tenta sem ela.
    if (error && /tipo/i.test(error.message)) {
      ;({ data, error } = await supabase
        .from('profiles')
        .select(`${campos}, teams(name, contestacao_label)`)
        .eq('id', userId)
        .single())
    }
    if (error) {
      console.error('Falha ao carregar perfil:', error.message)
      setProfile(null)
      return
    }
    if (await bloqueadoNesteComputador()) {
      setAvisoLogin(AVISO_TRAVADO)
      setProfile(null)
      await supabase.auth.signOut({ scope: 'local' })
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
    if (await bloqueadoNesteComputador()) {
      await supabase.auth.signOut({ scope: 'local' })
      return { error: AVISO_TRAVADO }
    }
    setAvisoLogin('')
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
    avisoLogin,
    contestacaoLabel: profile?.teams?.contestacao_label || 'Contestações',
    // Equipe de portabilidade (ex.: Isaque): o site esconde o que é só de
    // contestação (migration_075).
    portabilidade: profile?.teams?.tipo === 'portabilidade',
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
