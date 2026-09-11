// Cria as contas novas pedidas: 3 supervisores (Will + 2 sem nome) e 50
// contas de operação (OP001..OP050). NÃO mexe em nenhuma conta existente.
// Uso: npm run seed:novas

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

const ACCOUNTS = [
  { username: 'will', name: 'Will', password: senhaAleatoria(), role: 'supervisor' },
  { username: 'admin1', name: 'Admin 1', password: senhaAleatoria(), role: 'supervisor' },
  { username: 'admin2', name: 'Admin 2', password: senhaAleatoria(), role: 'supervisor' },
  ...Array.from({ length: 50 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0')
    return { username: `op${n}`, name: `OP${n}`, password: senhaAleatoria(), role: 'bko' }
  }),
]

async function upsertUser(account) {
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
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 })
    if (listError) throw listError
    const existing = list.users.find((u) => u.email === email)
    if (!existing) throw new Error(`Usuário ${email} não encontrado após conflito de criação.`)
    userId = existing.id
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
    team_id: null,
  })
  if (profileError) throw profileError

  if (account.role === 'bko') {
    const { error: perfError } = await admin.from('performance').upsert(
      {
        user_id: userId,
        contestation_goal: 100,
        contestations_done: 0,
        rescheduling_goal: 50,
        rescheduling_done: 0,
        objective: '',
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    if (perfError) throw perfError
  }

  console.log(`✓ ${account.username} criado.`)
}

const failed = []
for (const account of ACCOUNTS) {
  try {
    await upsertUser(account)
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
