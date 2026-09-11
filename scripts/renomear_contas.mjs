// Renomeia contas de BKO (username + nome + email de login), mantendo
// histórico/desempenho intactos. Uso: node scripts/renomear_contas.mjs
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  if (!existsSync('.env')) return
  const lines = readFileSync('.env', 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnv()

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.')
  process.exit(1)
}
const EMAIL_DOMAIN = 'painelbko.internal'
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const renomeios = [
  { de: 'giovanne', para: 'eduardo', novoNome: 'Eduardo' },
  { de: 'samuel', para: 'matheus', novoNome: 'Matheus' },
]

for (const { de, para, novoNome } of renomeios) {
  const { data: perfil, error: e1 } = await admin
    .from('profiles')
    .select('id, name, username')
    .eq('username', de)
    .maybeSingle()

  if (e1 || !perfil) {
    console.error(`[${de}] não encontrado:`, e1?.message || 'sem resultado')
    continue
  }

  const novoEmail = `${para}@${EMAIL_DOMAIN}`

  const { error: e2 } = await admin.auth.admin.updateUserById(perfil.id, { email: novoEmail })
  if (e2) {
    console.error(`[${de}] falha ao trocar email de login:`, e2.message)
    continue
  }

  const { error: e3 } = await admin
    .from('profiles')
    .update({ username: para, name: novoNome })
    .eq('id', perfil.id)
  if (e3) {
    console.error(`[${de}] falha ao trocar username/nome:`, e3.message)
    continue
  }

  console.log(`OK: ${de} -> ${para} (${novoNome})`)
}
