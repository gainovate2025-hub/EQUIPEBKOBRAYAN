import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  console.warn(
    'Supabase não configurado: preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example).'
  )
}

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : null

// Login é feito por "usuário", não e-mail. Internamente cada conta usa um
// e-mail sintético e-determinístico, nunca exposto na interface.
export const EMAIL_DOMAIN = 'painelbko.internal'
export const usernameToEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`
