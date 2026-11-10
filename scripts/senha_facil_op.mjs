// Troca a senha de uma faixa de contas de operação (opNNN) por uma senha
// FÁCIL de digitar: "Bko" + 4 números aleatórios (ex: Bko4821). Pedido do
// Brayan em 10/11/2026: as senhas aleatórias de 10 caracteres (com letras
// parecidas tipo l/I/1, O/0) davam erro de digitação. Cada conta continua
// com uma senha diferente, pra ninguém adivinhar a do outro.
// NÃO mexe em username, nome, papel nem equipe. As senhas vão pra um
// arquivo na Área de Trabalho, não pro git.
// Uso: npm run senha:op -- 51 60   (primeiro e último número)

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim()
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
  console.error('Uso: npm run senha:op -- <primeiro> <último>   (ex: 51 60)')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

function senhaFacil() {
  return `Bko${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`
}

const usernames = []
for (let n = primeiro; n <= ultimo; n++) usernames.push(`op${String(n).padStart(3, '0')}`)

const { data: perfis, error } = await admin
  .from('profiles')
  .select('id, username, role')
  .in('username', usernames)
if (error) throw error

const trocadas = []
for (const username of usernames) {
  const perfil = perfis.find((p) => p.username === username)
  if (!perfil) {
    console.log(`– ${username} não existe, pulei.`)
    continue
  }
  if (perfil.role !== 'operacao') {
    console.log(`– ${username} não é conta de operação (${perfil.role}), pulei.`)
    continue
  }
  const senha = senhaFacil()
  const { error: erroSenha } = await admin.auth.admin.updateUserById(perfil.id, { password: senha })
  if (erroSenha) {
    console.error(`✗ ${username} falhou: ${erroSenha.message}`)
    continue
  }
  trocadas.push({ username, senha })
  console.log(`✓ ${username} com senha nova.`)
}

if (trocadas.length) {
  const nome = `logins-operacao-op${String(primeiro).padStart(3, '0')}-op${String(ultimo).padStart(3, '0')}.txt`
  const arquivo = join(homedir(), 'Desktop', nome)
  const texto = [
    'Contas de operação do Painel BKO (papel: operação)',
    `Senhas trocadas em ${new Date().toLocaleString('pt-BR')} (as senhas antigas não valem mais)`,
    '',
    'usuário / senha',
    ...trocadas.map((t) => `${t.username} / ${t.senha}`),
    '',
  ].join('\n')
  writeFileSync(arquivo, texto, { mode: 0o600 })
  console.log(`\n${trocadas.length} senha(s) trocada(s). Lista salva em: ${arquivo}`)
}
