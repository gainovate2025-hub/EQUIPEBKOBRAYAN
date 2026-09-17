// Define a senha das 40 contas de baia (baia001..baia040) igual o nome de
// usuário, só em maiúsculo (ex: usuário baia001, senha BAIA001).
// Uso: node scripts/set_senhas_baia.mjs
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

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const usuarios = Array.from({ length: 40 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0')
  return { username: `baia${n}`, senha: `BAIA${n}` }
})

for (const { username, senha } of usuarios) {
  const { data: perfil, error: e1 } = await admin
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .maybeSingle()

  if (e1 || !perfil) {
    console.error(`[${username}] não encontrado:`, e1?.message || 'sem resultado')
    continue
  }

  const { error: e2 } = await admin.auth.admin.updateUserById(perfil.id, { password: senha })
  if (e2) {
    console.error(`[${username}] falha ao trocar senha:`, e2.message)
    continue
  }

  console.log(`OK: ${username} / ${senha}`)
}
