// Troca a senha das 40 contas baia001..baia040 por senhas novas
// aleatórias e imprime a lista no final. NÃO mexe em username, nome,
// role nem em nenhuma outra conta — só troca a senha de quem já existe.
// Uso: npm run reset:baia

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

const USERNAMES = Array.from({ length: 40 }, (_, i) => `baia${String(i + 1).padStart(3, '0')}`)

async function listarTodosUsuarios() {
  const todos = []
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    todos.push(...data.users)
    if (data.users.length < 200) break
    page += 1
  }
  return todos
}

const todosUsuarios = await listarTodosUsuarios()
const resultados = []
const falharam = []

for (const username of USERNAMES) {
  const email = `${username}@${EMAIL_DOMAIN}`
  const usuario = todosUsuarios.find((u) => u.email === email)
  if (!usuario) {
    falharam.push({ username, motivo: 'conta não existe — rode npm run seed:baia primeiro' })
    continue
  }
  const novaSenha = senhaAleatoria()
  const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: novaSenha })
  if (error) {
    falharam.push({ username, motivo: error.message })
    continue
  }
  resultados.push({ username, senha: novaSenha })
  console.log(`✓ ${username} — senha trocada.`)
}

console.log('\n=== Senhas novas (usuário / senha) ===')
for (const r of resultados) console.log(`${r.username} / ${r.senha}`)

if (falharam.length) {
  console.log('\nFalharam:')
  for (const f of falharam) console.log(`  ${f.username}: ${f.motivo}`)
}
