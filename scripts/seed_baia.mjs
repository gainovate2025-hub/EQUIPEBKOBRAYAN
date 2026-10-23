// Cria 40 contas de operação: baia001..baia040. NÃO mexe em nenhuma
// conta existente (se o login já existir, pula e avisa, sem trocar senha).
// Uso: npm run seed:baia

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

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
const EMAIL_DOMAIN = 'painelbko.internal'

function senhaAleatoria() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
}

const ACCOUNTS = Array.from({ length: 40 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0')
  return { username: `baia${n}`, name: `Baia ${n}`, password: senhaAleatoria(), role: 'operacao' }
})

async function pegarTeamIdOperacao() {
  const { data, error } = await admin.from('teams').select('id').eq('name', 'Operação').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Equipe "Operação" não encontrada — rode a migration_014_operacao.sql primeiro.')
  return data.id
}

async function upsertUser(account, teamIdOperacao) {
  const email = `${account.username}@${EMAIL_DOMAIN}`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: account.password,
    email_confirm: true,
  })

  let userId
  if (createError) {
    if (!createError.message.includes('already been registered') && createError.status !== 422) {
      throw createError
    }
    console.log(`↺ ${account.username} já existia — pulando (senha não foi alterada).`)
    return
  } else {
    userId = created.user.id
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    name: account.name,
    username: account.username,
    role: account.role,
    active: true,
    team_id: teamIdOperacao,
  })
  if (profileError) throw profileError

  console.log(`✓ ${account.username} criado.`)
}

const teamIdOperacao = await pegarTeamIdOperacao()

const failed = []
for (const account of ACCOUNTS) {
  try {
    await upsertUser(account, teamIdOperacao)
  } catch (err) {
    failed.push({ account, err })
    console.error(`✗ ${account.username} falhou: ${err.message}`)
  }
}

const ok = ACCOUNTS.filter((a) => !failed.some((f) => f.account === a))
console.log('\n=== Logins criados (usuário / senha) ===')
for (const a of ok) console.log(`${a.username} / ${a.password}`)

if (failed.length) {
  console.log('\nFalharam:')
  for (const f of failed) console.log(`  ${f.account.username}: ${f.err.message}`)
}
