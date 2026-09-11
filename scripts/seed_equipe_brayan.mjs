// Cria 3 contas novas de BKO pra equipe do Brayan (bko011, bko012, bko013).
// Uso: npm run seed:equipe

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
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const EMAIL_DOMAIN = 'painelbko.internal'

function senhaAleatoria() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
}

const { data: team, error: teamError } = await admin.from('teams').select('id').eq('name', 'Equipe Brayan').single()
if (teamError) throw teamError

const ACCOUNTS = [
  { username: 'bko011', name: 'BKO011', password: senhaAleatoria() },
  { username: 'bko012', name: 'BKO012', password: senhaAleatoria() },
  { username: 'bko013', name: 'BKO013', password: senhaAleatoria() },
]

for (const account of ACCOUNTS) {
  const email = `${account.username}@${EMAIL_DOMAIN}`
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: account.password,
    email_confirm: true,
  })
  if (createError) {
    console.error(`✗ ${account.username} falhou: ${createError.message}`)
    continue
  }
  const userId = created.user.id

  await admin.from('profiles').upsert({
    id: userId,
    name: account.name,
    username: account.username,
    role: 'bko',
    active: true,
    team_id: team.id,
  })

  await admin.from('performance').upsert(
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

  console.log(`✓ ${account.username} / ${account.password}`)
}
