import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.warn(
    'Supabase não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example).'
  )
}

// Guarda a sessão em localStorage (sobrevive fechar o navegador) só se a
// pessoa marcou "Lembrar de mim" no login — senão usa sessionStorage, que
// some quando o navegador é fechado de vez. A escolha fica na chave
// "bko_lembrar" (gravada em Login.jsx antes de entrar).
const authStorage = {
  getItem: (key) => {
    const lembrar = localStorage.getItem('bko_lembrar') !== '0'
    return (lembrar ? localStorage : sessionStorage).getItem(key)
  },
  setItem: (key, value) => {
    const lembrar = localStorage.getItem('bko_lembrar') !== '0'
    ;(lembrar ? localStorage : sessionStorage).setItem(key, value)
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { storage: authStorage } })
  : null

// Login é feito por "usuário", não e-mail. Internamente cada conta usa um
// e-mail sintético e-determinístico, nunca exposto na interface.
export const EMAIL_DOMAIN = 'painelbko.internal'
export const usernameToEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`

// Confere no servidor se a sessão guardada no navegador ainda existe
// (10/11/2026). Quando a senha de uma conta é trocada, o Supabase encerra
// todas as sessões dela, mas o navegador continua com o login antigo
// guardado: o site parecia logado e só o que confere o login no servidor
// (ex: consulta de operadora) falhava com "Não autenticado". Agora, se o
// servidor disser que a sessão não existe mais, desloga daqui e manda pro
// login. Falha de internet NÃO desloga ninguém (só 401/403 do servidor).
export async function encerrarSeSessaoMorta() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return false
  const { error } = await supabase.auth.getUser()
  if (error && (error.status === 401 || error.status === 403)) {
    await supabase.auth.signOut({ scope: 'local' })
    return true
  }
  return false
}
