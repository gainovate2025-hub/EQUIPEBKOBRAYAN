// Cria as 11 contas iniciais (1 supervisor + 10 BKO) no Supabase.
// Uso: preencha .env (veja .env.example) com VITE_SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY, depois rode: npm run seed

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
  console.error('Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env. Veja .env.example.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const EMAIL_DOMAIN = 'painelbko.internal'

const ACCOUNTS = [
  { username: 'brayan', name: 'Brayan', password: 'DIAS0508', role: 'supervisor' },
  { username: 'supervisao', name: 'Supervisao', password: '052502', role: 'supervisor' },

  { username: 'nathann', name: 'Nathann', password: 'BKO012', role: 'bko' },
  { username: 'kelvyn', name: 'Kelvyn', password: 'BKO032', role: 'bko' },
  { username: 'kauan', name: 'Kauan', password: 'BKO045', role: 'bko' },
  { username: 'victor', name: 'Victor', password: 'BKO065', role: 'bko' },
  { username: 'thiago', name: 'Thiago', password: 'BKO068', role: 'bko' },
  { username: 'icaro', name: 'Icaro', password: 'BKO028', role: 'bko' },
  { username: 'jaoa', name: 'Jaoa', password: 'BKO084', role: 'bko' },
  { username: 'stevam', name: 'Stevam', password: 'BKO084', role: 'bko' },
  { username: 'bko09', name: 'BKO09', password: 'BKO059', role: 'bko' },
  { username: 'bko010', name: 'BKO010', password: 'BKO065', role: 'bko' },
]

const MIN_PASSWORD_LENGTH = 6

async function upsertUser(account) {
  if (account.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`senha "${account.password}" tem menos de ${MIN_PASSWORD_LENGTH} caracteres (mínimo exigido pelo Supabase Auth).`)
  }

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
    console.log(`↺ ${account.username} já existia — reaproveitando conta.`)
  } else {
    userId = created.user.id
    console.log(`✓ ${account.username} criado.`)
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    name: account.name,
    username: account.username,
    role: account.role,
    active: true,
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
        commission: 0,
        objective: '',
      },
      { onConflict: 'user_id' }
    )
    if (perfError) throw perfError
  }
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
if (ok.length) {
  console.log('\nContas prontas. Logins (usuário / senha):')
  for (const a of ok) console.log(`  ${a.username} / ${a.password}`)
}
if (failed.length) {
  console.log('\nContas que falharam (corrija e rode "npm run seed" de novo — as demais já criadas não serão duplicadas):')
  for (const f of failed) console.log(`  ${f.account.username}: ${f.err.message}`)
}
console.log('\nRecomendado: troque essas senhas depois do primeiro acesso.')
