// Servidor do bot de atendimento por WhatsApp, ligado direto pelo site do
// BKO: a pessoa digita o número na tela de Automações, o site chama este
// servidor, e ele devolve um QR code (como imagem) pra escanear — sem
// terminal, sem instalar nada. Depois de escaneado, cada mensagem que
// chega é respondida com o mesmo menu de menu.js.
//
// Método NÃO oficial (Baileys, como o WhatsApp Web) — serve pra números de
// teste/equipe. Não é o número principal de atendimento a cliente (esse
// usa a API oficial da Meta, em server.js).
//
// Rodar (local): npm install && node whatsapp-bot/qr-server.js
// Variáveis de ambiente:
//   APP_SECRET       texto que só o site do BKO conhece — protege o
//                     servidor de qualquer um na internet ligar um número
//                     nele. Obrigatório em produção.
//   ALLOWED_ORIGIN    origem do site que pode chamar (ex: o endereço do
//                     GitHub Pages). Padrão: qualquer um (só p/ testar local).
//   PORT              padrão 4300

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { responder } from './menu.js'

const { APP_SECRET, ALLOWED_ORIGIN = '*', PORT = 4300 } = process.env
if (!APP_SECRET) console.warn('Aviso: sem APP_SECRET — qualquer um na internet pode ligar um número neste servidor.')

const PASTA_SESSOES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sessoes-qr')
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// numero -> { sock, status: 'conectando'|'aguardando_qr'|'conectado'|'desconectado', qr, conversas: Map, desligarPedido }
const sessoes = new Map()

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '')
}

function novaSessao(numero) {
  return { sock: null, status: 'conectando', qr: null, conversas: new Map(), desligarPedido: false }
}

async function conectar(numero) {
  const sessao = sessoes.get(numero)
  if (!sessao || sessao.desligarPedido) return

  const pastaAuth = path.join(PASTA_SESSOES, numero)
  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }) })
  sessao.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      sessao.status = 'aguardando_qr'
      sessao.qr = await QRCode.toDataURL(qr)
    }
    if (connection === 'open') {
      sessao.status = 'conectado'
      sessao.qr = null
    }
    if (connection === 'close') {
      if (sessao.desligarPedido) {
        sessoes.delete(numero)
        return
      }
      const codigo = lastDisconnect?.error?.output?.statusCode
      if (codigo === DisconnectReason.loggedOut) {
        sessao.status = 'desconectado'
        sessao.sock = null
        return
      }
      sessao.status = 'conectando'
      await dormir(1500)
      conectar(numero)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      const jid = msg.key.remoteJid
      if (!jid || msg.key.fromMe) continue
      if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue

      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
      const { respostas, conversa } = responder(sessao.conversas.get(jid), texto)
      sessao.conversas.set(jid, conversa)

      for (const resposta of respostas) {
        await sock.sendPresenceUpdate('composing', jid)
        await dormir(1200)
        await sock.sendMessage(jid, { text: resposta })
      }
    }
  })
}

async function iniciarSessao(numero) {
  let sessao = sessoes.get(numero)
  if (sessao && sessao.status !== 'desconectado') return sessao
  sessao = novaSessao(numero)
  sessoes.set(numero, sessao)
  conectar(numero).catch((err) => {
    console.error(`Falha ao conectar ${numero}:`, err.message)
    sessao.status = 'desconectado'
  })
  return sessao
}

async function desligarSessao(numero) {
  const sessao = sessoes.get(numero)
  if (!sessao) return
  sessao.desligarPedido = true
  try {
    await sessao.sock?.logout()
  } catch {
    /* já desconectado, tudo bem */
  }
  sessoes.delete(numero)
}

function autorizado(req) {
  if (!APP_SECRET) return true
  return req.headers['x-app-secret'] === APP_SECRET
}

function comCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-secret')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function json(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(corpo))
}

async function lerCorpo(req) {
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  const texto = Buffer.concat(pedacos).toString('utf8')
  return texto ? JSON.parse(texto) : {}
}

const servidor = http.createServer(async (req, res) => {
  comCors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url, 'http://localhost')
  if (!autorizado(req)) { json(res, 401, { erro: 'Não autorizado.' }); return }

  try {
    if (url.pathname === '/status' && req.method === 'GET') {
      const numero = soDigitos(url.searchParams.get('numero'))
      const sessao = sessoes.get(numero)
      if (!sessao) { json(res, 200, { status: 'sem_sessao' }); return }
      json(res, 200, { status: sessao.status, qr: sessao.qr })
      return
    }

    if (url.pathname === '/iniciar' && req.method === 'POST') {
      const { numero: bruto } = await lerCorpo(req)
      const numero = soDigitos(bruto)
      if (numero.length < 10) { json(res, 400, { erro: 'Número inválido — usa DDI + DDD + número, só dígitos.' }); return }
      const sessao = await iniciarSessao(numero)
      json(res, 200, { status: sessao.status })
      return
    }

    if (url.pathname === '/desligar' && req.method === 'POST') {
      const { numero: bruto } = await lerCorpo(req)
      await desligarSessao(soDigitos(bruto))
      json(res, 200, { ok: true })
      return
    }

    json(res, 200, { ok: true, servico: 'whatsapp-bot qr-server' })
  } catch (err) {
    json(res, 500, { erro: err.message })
  }
})

servidor.listen(PORT, () => console.log(`Servidor de QR do WhatsApp ouvindo na porta ${PORT}`))
