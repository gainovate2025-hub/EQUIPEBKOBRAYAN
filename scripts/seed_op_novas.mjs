// Cria contas novas de operação seguindo a numeração op001..op050 que já
// existe (10/11/2026: op051..op060). NÃO mexe em nenhuma conta existente:
// se o login já existir, pula e avisa, sem trocar senha.
// As senhas (aleatórias) vão pra um arquivo na Área de Trabalho, não pro git.
// Uso: npm run seed:op -- 51 60   (primeiro e último número)

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

const primeiro = Number(process.argv[2])
const ultimo = Number(process.argv[3])
if (!primeiro || !ultimo || ultimo < primeiro || ultimo - primeiro > 99) {
  console.error('Uso: npm run seed:op -- <primeiro> <último>   (ex: 51 60)')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const EMAIL_DOMAIN = 'painelbko.internal'

function senhaAleatoria() {
  return crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
}

const contas = []
for (let n = primeiro; n <= ultimo; n++) {
  const num = String(n).padStart(3, '0')
  contas.push({ username: `op${num}`, name: `Operação ${num}`, password: senhaAleatoria() })
}

const { data: equipe, error: erroEquipe } = await admin.from('teams').select('id').eq('name', 'Operação').maybeSingle()
if (erroEquipe) throw erroEquipe
if (!equipe) throw new Error('Equipe "Operação" não encontrada — rode a migration_014_operacao.sql primeiro.')

// Só entram na lista final as contas criadas AGORA (o script antigo
// seed_baia listava também as que já existiam, com uma senha que nunca foi
// gravada).
const criadas = []
for (const conta of contas) {
  const { data: novo, error } = await admin.auth.admin.createUser({
    email: `${conta.username}@${EMAIL_DOMAIN}`,
    password: conta.password,
    email_confirm: true,
  })
  if (error) {
    if (error.message.includes('already been registered') || error.status === 422) {
      console.log(`↺ ${conta.username} já existia, pulei (senha não mudou).`)
    } else {
      console.error(`✗ ${conta.username} falhou: ${error.message}`)
    }
    continue
  }
  const { error: erroPerfil } = await admin.from('profiles').upsert({
    id: novo.user.id,
    name: conta.name,
    username: conta.username,
    role: 'operacao',
    active: true,
    team_id: equipe.id,
  })
  if (erroPerfil) {
    console.error(`✗ ${conta.username}: login criado, mas o perfil falhou: ${erroPerfil.message}`)
    continue
  }
  criadas.push(conta)
  console.log(`✓ ${conta.username} criado.`)
}

if (criadas.length) {
  const arquivo = join(homedir(), 'Desktop', `logins-operacao-op${String(primeiro).padStart(3, '0')}-op${String(ultimo).padStart(3, '0')}.txt`)
  const texto = [
    'Contas de operação do Painel BKO (papel: operação)',
    `Criadas em ${new Date().toLocaleString('pt-BR')}`,
    '',
    'usuário / senha',
    ...criadas.map((c) => `${c.username} / ${c.password}`),
    '',
  ].join('\n')
  writeFileSync(arquivo, texto, { mode: 0o600 })
  console.log(`\n${criadas.length} conta(s) criada(s). Logins e senhas salvos em: ${arquivo}`)
} else {
  console.log('\nNenhuma conta nova criada.')
}
